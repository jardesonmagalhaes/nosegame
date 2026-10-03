import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BETSAPI_TOKEN = process.env.BETSAPI_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BETSAPI_TOKEN) {
    console.error("ERRO: Uma ou mais variáveis de ambiente não foram configuradas nos Secrets!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MARGEM_DESCONTO = 0.85; // 15% de desconto fixo

function aplicarMargem(oddOriginal) {
    if (!oddOriginal || parseFloat(oddOriginal) <= 1) return null;
    const oddComDesconto = parseFloat(oddOriginal) * MARGEM_DESCONTO;
    return parseFloat(oddComDesconto.toFixed(2));
}

async function sincronizarTudoComBetsAPI() {
    console.log("Iniciando busca automática na BetsAPI...");

    // Tenta primeiro o endpoint b365api / betfair
    let url = `https://api.b365api.com/v1/betfair/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;
    let response = await fetch(url);
    let data = await response.json();

    if (!data.results || data.results.length === 0) {
        console.log("Endpoint Betfair não retornou jogos. Tentando endpoint alternativo de eventos...");
        url = `https://api.b365api.com/v1/event/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;
        response = await fetch(url);
        data = await response.json();
    }

    if (!data.results || data.results.length === 0) {
        console.log("Aviso: Nenhum jogo retornado da API ou cotação pendente.");
        console.log("Resposta recebida da BetsAPI:", JSON.stringify(data));
        return;
    }

    console.log(`Encontrados ${data.results.length} jogos. Processando e aplicando margem de -15%...`);

    for (const event of data.results) {
        try {
            const league = event.league ? event.league.name : 'Futebol Interno';
            const homeTeam = event.home ? event.home.name : 'Casa';
            const awayTeam = event.away ? event.away.name : 'Fora';
            
            const timeUnix = parseInt(event.time) * 1000;
            const matchTime = new Date(timeUnix).toISOString();

            const rawHome = event.main_odds?.home_od || event.home_od || (event.odds && event.odds['1_1']?.home_od);
            const rawDraw = event.main_odds?.draw_od || event.draw_od || (event.odds && event.odds['1_1']?.draw_od);
            const rawAway = event.main_odds?.away_od || event.away_od || (event.odds && event.odds['1_1']?.away_od);

            const oddH = aplicarMargem(rawHome) || 1.80;
            const oddD = aplicarMargem(rawDraw) || 3.10;
            const oddA = aplicarMargem(rawAway) || 3.40;

            const matchData = {
                league: league,
                home_team: homeTeam,
                away_team: awayTeam,
                match_time: matchTime,
                status: 'OPEN',
                odd_home: oddH,
                odd_draw: oddD,
                odd_away: oddA
            };

            const { error } = await supabase
                .from('matches')
                .upsert(matchData, { onConflict: 'home_team, away_team, match_time' });

            if (error) {
                console.error(`Erro no Supabase [${homeTeam} x ${awayTeam}]:`, error.message);
            } else {
                console.log(`[OK] ${homeTeam} x ${awayTeam} gravado!`);
            }
        } catch (errInner) {
            console.error("Erro ao processar item individual:", errInner.message);
        }
    }

    console.log("Sincronização concluída com sucesso!");
}

sincronizarTudoComBetsAPI().catch(err => {
    console.error("Erro na rotina principal:", err.message);
});
