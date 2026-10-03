import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BETSAPI_TOKEN = process.env.BETSAPI_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MARGEM_DESCONTO = 0.85; // 15% de desconto fixo

function aplicarMargem(oddOriginal) {
    if (!oddOriginal || parseFloat(oddOriginal) <= 1) return null;
    const oddComDesconto = parseFloat(oddOriginal) * MARGEM_DESCONTO;
    return parseFloat(oddComDesconto.toFixed(2));
}

async function sincronizarTudoComBetsAPI() {
    console.log("Iniciando busca automática de jogos e odds na BetsAPI...");

    // Endpoint de próximos jogos de futebol
    const upcomingUrl = `https://api.b365api.com/v1/betfair/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;

    try {
        const response = await fetch(upcomingUrl);
        const data = await response.json();

        if (data.success !== 1 || !data.results || data.results.length === 0) {
            console.log("Nenhum jogo novo retornado ou limite atingido:", data);
            return;
        }

        console.log(`Encontrados ${data.results.length} jogos. Processando mercados...`);

        for (const event of data.results) {
            const eventId = event.event_id || event.id;
            const league = event.league ? event.league.name : 'Futebol Interno';
            const homeTeam = event.home ? event.home.name : 'Casa';
            const awayTeam = event.away ? event.away.name : 'Fora';
            const matchTime = new Date(parseInt(event.time) * 1000).toISOString();

            // Busca as odds completas do evento
            const oddsUrl = `https://api.b365api.com/v1/betfair/event/odds?token=${BETSAPI_TOKEN}&event_id=${eventId}`;
            const oddsResponse = await fetch(oddsUrl);
            const oddsData = await oddsResponse.json();

            let oddsObj = oddsData.results || {};

            const matchData = {
                league: league,
                home_team: homeTeam,
                away_team: awayTeam,
                match_time: matchTime,
                status: 'OPEN',

                // Odds 1X2
                odd_home: aplicarMargem(oddsObj.MATCH_ODDS?.home || event.main_odds?.home_od),
                odd_draw: aplicarMargem(oddsObj.MATCH_ODDS?.draw || event.main_odds?.draw_od),
                odd_away: aplicarMargem(oddsObj.MATCH_ODDS?.away || event.main_odds?.away_od),

                // Dupla Chance
                odd_dc1x: aplicarMargem(oddsObj.DOUBLE_CHANCE?.home_draw),
                odd_dc_12: aplicarMargem(oddsObj.DOUBLE_CHANCE?.home_away),
                odd_dc_x2: aplicarMargem(oddsObj.DOUBLE_CHANCE?.draw_away),

                // Gols Over/Under 2.5
                odd_over25: aplicarMargem(oddsObj.OVER_UNDER_25?.over),
                odd_under25: aplicarMargem(oddsObj.OVER_UNDER_25?.under),

                // Ambas Marcam
                odd_btts_yes: aplicarMargem(oddsObj.BOTH_TEAMS_SCORE?.yes),
                odd_btts_no: aplicarMargem(oddsObj.BOTH_TEAMS_SCORE?.no),

                // Gols 1º Tempo 0.5
                odd_ht_over05: aplicarMargem(oddsObj.FIRST_HALF_GOALS_05?.over),
                odd_ht_under05: aplicarMargem(oddsObj.FIRST_HALF_GOALS_05?.under)
            };

            // Se pelo menos as odds de vitória existirem, insere/atualiza no Supabase
            if (matchData.odd_home && matchData.odd_draw && matchData.odd_away) {
                const { error } = await supabase
                    .from('matches')
                    .upsert(matchData, { onConflict: 'home_team, away_team, match_time' });

                if (error) {
                    console.error(`Erro ao salvar ${homeTeam} x ${awayTeam}:`, error.message);
                } else {
                    console.log(`[OK] ${homeTeam} x ${awayTeam} sincronizado com -15%!`);
                }
            }
        }

        console.log("Sincronização concluída com sucesso!");

    } catch (err) {
        console.error("Falha ao rodar a sincronização:", err);
    }
}

sincronizarTudoComBetsAPI();
