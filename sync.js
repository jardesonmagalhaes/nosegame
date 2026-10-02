import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BETSAPI_TOKEN = process.env.BETSAPI_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MARGEM_DESCONTO = 0.85; // 15% de desconto

function aplicarMargem(oddOriginal) {
    if (!oddOriginal || parseFloat(oddOriginal) <= 1) return 1.01;
    const oddComDesconto = parseFloat(oddOriginal) * MARGEM_DESCONTO;
    return parseFloat(oddComDesconto.toFixed(2));
}

async function sincronizarTudoComBetsAPI() {
    console.log("Iniciando busca automática na BetsAPI...");

    const upcomingUrl = `https://api.b365api.com/v1/betfair/upcoming?sport_id=1&token=${BETSAPI_TOKEN}`;

    try {
        const response = await fetch(upcomingUrl);
        const data = await response.json();

        if (data.success !== 1 || !data.results) {
            console.error("Erro ao consultar BetsAPI:", data);
            return;
        }

        console.log(`Encontrados ${data.results.length} jogos.`);

        for (const event of data.results) {
            const eventId = event.event_id || event.id;
            const league = event.league ? event.league.name : 'Futebol';
            const homeTeam = event.home ? event.home.name : 'Casa';
            const awayTeam = event.away ? event.away.name : 'Fora';
            const matchTime = new Date(parseInt(event.time) * 1000).toISOString();

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
                odd_home: aplicarMargem(oddsObj.MATCH_ODDS?.home || event.main_odds?.home_od || 2.00),
                odd_draw: aplicarMargem(oddsObj.MATCH_ODDS?.draw || event.main_odds?.draw_od || 3.10),
                odd_away: aplicarMargem(oddsObj.MATCH_ODDS?.away || event.main_odds?.away_od || 3.40),
                odd_dc1x: aplicarMargem(oddsObj.DOUBLE_CHANCE?.home_draw || 1.25),
                odd_dc_12: aplicarMargem(oddsObj.DOUBLE_CHANCE?.home_away || 1.30),
                odd_dc_x2: aplicarMargem(oddsObj.DOUBLE_CHANCE?.draw_away || 1.60),
                odd_over25: aplicarMargem(oddsObj.OVER_UNDER_25?.over || 1.90),
                odd_under25: aplicarMargem(oddsObj.OVER_UNDER_25?.under || 1.80),
                odd_btts_yes: aplicarMargem(oddsObj.BOTH_TEAMS_SCORE?.yes || 1.85),
                odd_btts_no: aplicarMargem(oddsObj.BOTH_TEAMS_SCORE?.no || 1.85),
                odd_ht_over05: aplicarMargem(oddsObj.FIRST_HALF_GOALS_05?.over || 1.40),
                odd_ht_under05: aplicarMargem(oddsObj.FIRST_HALF_GOALS_05?.under || 2.60)
            };

            await supabase.from('matches').upsert(matchData, { onConflict: 'home_team, away_team, match_time' });
        }

        console.log("Sincronização concluída com sucesso!");

    } catch (err) {
        console.error("Falha ao sincronizar:", err);
    }
}

sincronizarTudoComBetsAPI();
