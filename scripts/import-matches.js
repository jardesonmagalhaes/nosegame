const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = "https://weaffqocmxfczgwketrb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY || !API_FOOTBALL_KEY) {
    console.error("❌ ERRO CRÍTICO: Secrets não encontradas!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Função para aplicar a tua margem de lucro de 25% na cotação da banca
function applyBancaMargin(marketOdd, discountPercent = 0.25) {
    if (!marketOdd || isNaN(marketOdd) || marketOdd <= 1.0) return 1.05;
    const profit = marketOdd - 1;
    const adjustedProfit = profit * (1 - discountPercent);
    return parseFloat((1 + adjustedProfit).toFixed(2));
}

// Ligas Oficiais Focadas:
// 71: Brasileirão Série A | 72: Brasileirão Série B | 39: Premier League | 140: La Liga | 135: Serie A | 2: UEFA Champions League
const TARGET_LEAGUES = [71, 72, 39, 140, 135, 2];

async function syncDailyMatches() {
    console.log("🚀 A carregar jogos REAIS das próximas rodadas oficiais...");
    let totalSaved = 0;

    for (const leagueId of TARGET_LEAGUES) {
        try {
            // Puxa os próximos 10 jogos reais da temporada atual da liga
            const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2025&next=10`;
            const response = await axios.get(url, {
                headers: { 'x-apisports-key': API_FOOTBALL_KEY }
            });

            const fixtures = response.data.response || [];
            console.log(`⚽ Liga ID ${leagueId}: ${fixtures.length} confrontos reais encontrados.`);

            for (const item of fixtures) {
                const fixtureId = item.fixture.id;
                const leagueName = item.league?.name || 'Liga Esportiva';
                const countryName = item.league?.country || 'Mundo';
                const homeTeam = item.teams?.home?.name;
                const awayTeam = item.teams?.away?.name;
                const matchTime = item.fixture?.date;

                let rawHome = 2.10, rawDraw = 3.20, rawAway = 3.40;

                // Tenta procurar cotações reais do mercado para o jogo
                try {
                    const oddsResponse = await axios.get(`https://v3.football.api-sports.io/odds?fixture=${fixtureId}`, {
                        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
                    });
                    const oddsData = oddsResponse.data.response[0];
                    if (oddsData && oddsData.bookmakers && oddsData.bookmakers.length > 0) {
                        const matchWinner = oddsData.bookmakers[0].bets.find(b => b.id === 1);
                        if (matchWinner) {
                            rawHome = matchWinner.values.find(v => v.value === 'Home')?.odd || rawHome;
                            rawDraw = matchWinner.values.find(v => v.value === 'Draw')?.odd || rawDraw;
                            rawAway = matchWinner.values.find(v => v.value === 'Away')?.odd || rawAway;
                        }
                    }
                } catch (e) {
                    // Mantém cotação calculada de base se o mercado ainda não abriu
                }

                const matchPayload = {
                    league: `${countryName} - ${leagueName}`,
                    home_team: homeTeam,
                    away_team: awayTeam,
                    match_time: matchTime,
                    status: 'OPEN',
                    odd_home: applyBancaMargin(rawHome, 0.25),
                    odd_draw: applyBancaMargin(rawDraw, 0.25),
                    odd_away: applyBancaMargin(rawAway, 0.25)
                };

                const { error } = await supabase.from('matches').insert([matchPayload]);
                if (!error) {
                    console.log(`✅ JOGO REAL GRAVADO: ${homeTeam} x ${awayTeam} (${matchTime})`);
                    totalSaved++;
                } else {
                    console.error(`❌ Erro ao gravar ${homeTeam} x ${awayTeam}:`, error.message);
                }
            }
        } catch (err) {
            console.error(`⚠️ Erro na consulta da liga ${leagueId}:`, err.message);
        }

        if (totalSaved >= 15) break;
    }

    console.log(`✨ Processo finalizado com SUCESSO! Total de jogos reais inseridos: ${totalSaved}`);
}

syncDailyMatches();
