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

function applyBancaMargin(marketOdd, discountPercent = 0.25) {
    if (!marketOdd || isNaN(marketOdd) || marketOdd <= 1.0) return 1.05;
    const profit = marketOdd - 1;
    const adjustedProfit = profit * (1 - discountPercent);
    return parseFloat((1 + adjustedProfit).toFixed(2));
}

// Ligas Principais (IDs da API-Football: 71=Brasileirão A, 39=Premier League, 140=La Liga, 135=Serie A, 2=Champions)
const MAIN_LEAGUES = [71, 39, 140, 135, 2];

async function syncDailyMatches() {
    console.log("🚀 A iniciar a sincronização de jogos por Ligas e Datas...");
    
    // Gerar datas para hoje, amanhã e depois de amanhã
    const datesToTest = [];
    for (let i = 0; i <= 2; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        datesToTest.push(d.toISOString().split('T')[0]);
    }

    let totalSaved = 0;

    for (const dateStr of datesToTest) {
        console.log(`🔍 Procurando partidas para a data: ${dateStr}...`);

        for (const leagueId of MAIN_LEAGUES) {
            try {
                const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${dateStr}&league=${leagueId}&season=2026`, {
                    headers: { 'x-apisports-key': API_FOOTBALL_KEY }
                });

                const fixtures = response.data.response || [];
                if (fixtures.length > 0) {
                    console.log(`⚽ Encontrados ${fixtures.length} jogos para a liga ID ${leagueId} em ${dateStr}.`);

                    for (const item of fixtures.slice(0, 5)) {
                        const leagueName = item.league?.name || 'Liga Esportiva';
                        const countryName = item.league?.country || 'Mundo';
                        const homeTeam = item.teams?.home?.name || 'Time Casa';
                        const awayTeam = item.teams?.away?.name || 'Time Fora';
                        const matchTime = item.fixture?.date || new Date().toISOString();

                        const matchPayload = {
                            league: `${countryName} - ${leagueName}`,
                            home_team: homeTeam,
                            away_team: awayTeam,
                            match_time: matchTime,
                            status: 'OPEN',
                            odd_home: applyBancaMargin(2.10, 0.25),
                            odd_draw: applyBancaMargin(3.20, 0.25),
                            odd_away: applyBancaMargin(3.40, 0.25),
                            odd_over15: applyBancaMargin(1.28, 0.25),
                            odd_under15: applyBancaMargin(3.00, 0.25),
                            odd_over25: applyBancaMargin(1.85, 0.25),
                            odd_under25: applyBancaMargin(1.85, 0.25),
                            odd_btts_yes: applyBancaMargin(1.80, 0.25),
                            odd_btts_no: applyBancaMargin(1.90, 0.25),
                            odd_dc1x: applyBancaMargin(1.25, 0.25),
                            odd_dc_x2: applyBancaMargin(1.35, 0.25),
                            odd_dc_12: applyBancaMargin(1.28, 0.25)
                        };

                        const { data, error } = await supabase.from('matches').insert([matchPayload]).select();

                        if (error) {
                            console.error(`❌ Erro em [${homeTeam} x ${awayTeam}]: ${error.message}`);
                        } else {
                            console.log(`✅ Salvo: ${homeTeam} x ${awayTeam}`);
                            totalSaved++;
                        }
                    }
                }
            } catch (err) {
                // Continua se a requisição de uma liga específica falhar
            }
        }

        if (totalSaved >= 10) break; // Garante uma boa quantidade sem estourar a cota
    }

    console.log(`✨ Processo concluído! Total de jogos guardados no Supabase: ${totalSaved}`);
}

syncDailyMatches();
