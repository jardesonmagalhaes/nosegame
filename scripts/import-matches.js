const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = "https://weaffqocmxfczgwketrb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function applyBancaMargin(marketOdd, discountPercent = 0.25) {
    if (!marketOdd || marketOdd <= 1.0) return 1.05;
    const profit = marketOdd - 1;
    const adjustedProfit = profit * (1 - discountPercent);
    return parseFloat((1 + adjustedProfit).toFixed(2));
}

async function syncDailyMatches() {
    console.log("🚀 A iniciar a sincronização de jogos...");
    const today = new Date().toISOString().split('T')[0];

    try {
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY }
        });

        const fixtures = response.data.response || [];
        console.log(`⚽ Encontrados ${fixtures.length} jogos na API para hoje.`);

        if (fixtures.length === 0) {
            console.log("Nenhum jogo encontrado para a data de hoje.");
            return;
        }

        const sampleFixtures = fixtures.slice(0, 15);

        for (const item of sampleFixtures) {
            const fixtureId = item.fixture.id;
            const leagueName = item.league.name;
            const countryName = item.league.country;
            const homeTeam = item.teams.home.name;
            const awayTeam = item.teams.away.name;
            const matchTime = item.fixture.date;

            let rawHome = 2.00, rawDraw = 3.10, rawAway = 3.50;

            try {
                const oddsResponse = await axios.get(`https://v3.football.api-sports.io/odds?fixture=${fixtureId}`, {
                    headers: { 'x-apisports-key': API_FOOTBALL_KEY }
                });

                const oddsData = oddsResponse.data.response[0];
                if (oddsData && oddsData.bookmakers && oddsData.bookmakers.length > 0) {
                    const bets = oddsData.bookmakers[0].bets;
                    const matchWinner = bets.find(b => b.id === 1);
                    if (matchWinner) {
                        rawHome = matchWinner.values.find(v => v.value === 'Home')?.odd || rawHome;
                        rawDraw = matchWinner.values.find(v => v.value === 'Draw')?.odd || rawDraw;
                        rawAway = matchWinner.values.find(v => v.value === 'Away')?.odd || rawAway;
                    }
                }
            } catch (errOdds) {
                console.log(`Odds padrão aplicadas para ${homeTeam} x ${awayTeam}`);
            }

            // Removido o campo 'id' para permitir que o Supabase gere o UUID nativo
            const matchPayload = {
                league: `${countryName} - ${leagueName}`,
                home_team: homeTeam,
                away_team: awayTeam,
                match_time: matchTime,
                status: 'OPEN',
                odd_home: applyBancaMargin(rawHome, 0.25),
                odd_draw: applyBancaMargin(rawDraw, 0.25),
                odd_away: applyBancaMargin(rawAway, 0.25),
                odd_over15: applyBancaMargin(1.28, 0.25),
                odd_under15: applyBancaMargin(3.00, 0.25),
                odd_btts_yes: applyBancaMargin(1.85, 0.25),
                odd_btts_no: applyBancaMargin(1.85, 0.25)
            };

            const { error } = await supabase.from('matches').insert([matchPayload]);
            if (error) {
                console.error(`❌ Erro ao inserir ${homeTeam} x ${awayTeam}:`, error.message);
            } else {
                console.log(`✅ Jogo inserido com sucesso: ${homeTeam} x ${awayTeam}`);
            }
        }

        console.log("✨ Processo de importação finalizado!");
    } catch (err) {
        console.error("❌ Erro geral:", err.message);
        process.exit(1);
    }
}

syncDailyMatches();
