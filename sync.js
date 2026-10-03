import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BETSAPI_TOKEN = process.env.BETSAPI_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MARGEM_DESCONTO = 0.85; // 15% de desconto

function aplicarMargem(oddOriginal) {
    if (!oddOriginal || parseFloat(oddOriginal) <= 1) return null;
    const oddComDesconto = parseFloat(oddOriginal) * MARGEM_DESCONTO;
    return parseFloat(oddComDesconto.toFixed(2));
}

async function sincronizarTudoComBetsAPI() {
    console.log("A iniciar procura de jogos na BetsAPI...");

    // Tenta primeiro o endpoint da Betfair e depois o endpoint genérico de futebol (sport_id=1)
    let url = `https://api.b365api.com/v1/betfair/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;
    let response = await fetch(url);
    let data = await response.json();

    if (!data.results || data.results.length === 0) {
        console.log("Endpoint Betfair sem resultados. A tentar endpoint genérico de próximos eventos...");
        url = `https://api.b365api.com/v1/event/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;
        response = await fetch(url);
        data = await response.json();
    }

    if (!data.results || data.results.length === 0) {
        console.error("Nenhum jogo retornado da BetsAPI. Resposta da API:", data);
        return;
    }

    console.log(`Encontrados ${data.results.length} jogos! A processar...`);

    for (const event of data.results) {
        const league = event.league ? event.league.name : 'Futebol';
        const homeTeam = event.home ? event.home.name : 'Casa';
        const awayTeam = event.away ? event.away.name : 'Fora';
        
        // Converte o timestamp Unix recebido para data no formato ISO
        const timeUnix = parseInt(event.time) * 1000;
        const matchTime = new Date(timeUnix).toISOString();

        // Garante a leitura das odds principais
        const rawHome = event.main_odds?.home_od || event.home_od || event.odds?.['1_1']?.home_od;
        const rawDraw = event.main_odds?.draw_od || event.draw_od || event.odds?.['1_1']?.draw_od;
        const rawAway = event.main_odds?.away_od || event.away_od || event.odds?.['1_1']?.away_od;

        // Aplica o desconto de 15% (ou atribui valor base de mercado caso venha sem odd)
        const oddH = aplicarMargem(rawHome) || 1.85;
        const oddD = aplicarMargem(rawDraw) || 3.20;
        const oddA = aplicarMargem(rawAway) || 3.50;

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
            console.error(`Erro ao guardar ${homeTeam} x ${awayTeam}:`, error.message);
        } else {
            console.log(`[SUCESSO] ${homeTeam} x ${awayTeam} (${matchTime})`);
        }
    }

    console.log("Sincronização concluída!");
}

sincronizarTudoComBetsAPI();
