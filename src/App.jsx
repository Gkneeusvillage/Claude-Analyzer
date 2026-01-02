import React, { useState, useMemo } from "react";
import Papa from "papaparse";

/* ===============================
    Constants & Helpers
================================ */

const INVERSE_CATEGORIES = ["RkOv", "GAA", "GA", "L"];

const normalize = (value) => String(value || "").trim().toLowerCase();

const sanitizeCSVValue = (value) => {
  if (typeof value !== "string") return value;
  // Prevent CSV injection
  if (value.startsWith("=") || value.startsWith("+") || 
      value.startsWith("-") || value.startsWith("@")) {
    return value.substring(1);
  }
  return value;
};

const getImpactIcon = (value, isInverse = false) => {
  const isPositive = isInverse ? value < 0 : value > 0;
  const isNegative = isInverse ? value > 0 : value < 0;
  if (isPositive) return { icon: "▲", color: "#22c55e", label: "Gain" };
  if (isNegative) return { icon: "▼", color: "#ef4444", label: "Loss" };
  return { icon: "●", color: "#94a3b8", label: "Neutral" };
};

const SAMPLE_CSV = `Player,Position,Team,Score,Salary,Age,G,A,PIM,PPP,SOG
Connor McDavid,C,EDM,450.5,12500000,27,64,89,26,48,358
Auston Matthews,C,TOR,425.3,11640250,26,69,38,22,37,342
Nathan MacKinnon,C,COL,418.7,12600000,28,51,89,45,42,329
Leon Draisaitl,C,EDM,405.2,8500000,28,41,65,28,35,285
Nikita Kucherov,RW,TBL,398.4,9500000,30,44,100,28,43,314
David Pastrnak,RW,BOS,385.6,11250000,27,47,63,34,38,301
Mikko Rantanen,RW,COL,378.9,9250000,27,42,65,24,35,287
Artemi Panarin,LW,NYR,372.3,11642857,32,49,71,20,40,296
Matthew Tkachuk,LW,FLA,365.8,9500000,26,41,67,45,33,278
Cale Makar,D,COL,392.1,9000000,25,29,61,34,38,259
Quinn Hughes,D,VAN,358.4,7850000,24,17,75,20,42,267
Roman Josi,D,NSH,342.7,9059000,33,23,62,28,35,241
Erik Karlsson,D,PIT,335.2,10000000,33,11,90,26,44,253
Adam Fox,D,NYR,328.9,9500000,25,17,56,16,32,198
Igor Shesterkin,G,NYR,380.5,5666667,28,36,17,0,0,1612
Connor Hellebuyck,G,WPG,365.3,6166667,30,37,19,0,0,1598
Ilya Sorokin,G,NYI,352.8,4000000,28,31,22,0,0,1485
Andrei Vasilevskiy,G,TBL,348.2,9500000,29,28,24,0,0,1521
Jake Oettinger,G,DAL,332.6,4000000,25,35,14,0,0,1467`;

/* ===============================
    Main Component
================================ */

export default function FantasyTradeAnalyzer() {
  const [players, setPlayers] = useState([]);
  const [teamA, setTeamA] = useState([""]);
  const [teamB, setTeamB] = useState([""]);
  const [teamC, setTeamC] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showTeamC, setShowTeamC] = useState(false);

  /* ===============================
      CSV Processing
  ================================ */

  const processCSVData = (data) => {
    try {
      // Clean and sanitize data
      const cleaned = data.map((row) => {
        const cleanRow = {};
        Object.keys(row).forEach((key) => {
          let val = sanitizeCSVValue(row[key]);
          // Remove commas from numbers
          if (typeof val === "string" && /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(val)) {
            val = val.replace(/,/g, "");
          }
          cleanRow[key.trim()] = val;
        });
        return cleanRow;
      });

      // Validate data
      const hasValidPlayers = cleaned.some(p => p.Player && p.Score);
      if (!hasValidPlayers) {
        throw new Error("CSV must contain 'Player' and 'Score' columns with valid data");
      }

      // Calculate TA Scores for relative value
      const scores = cleaned
        .map(p => parseFloat(p.Score))
        .filter(s => !isNaN(s));
      
      if (scores.length === 0) {
        throw new Error("No valid score data found in CSV");
      }

      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      // Use sample standard deviation (n-1)
      const variance = scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (scores.length - 1);
      const stdDev = Math.sqrt(variance);

      const playersWithZ = cleaned.map(p => {
        const score = parseFloat(p.Score);
        return {
          ...p,
          taScore: !isNaN(score) ? (score - mean) / (stdDev || 1) : 0
        };
      });

      setPlayers(playersWithZ);
      setError(null);
    } catch (err) {
      throw new Error(`Data processing error: ${err.message}`);
    }
  };

  const handleCSVUpload = (file) => {
    if (!file) return;

    setError(null);
    
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large. Please upload a CSV under 5MB.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid CSV file.");
      return;
    }

    setIsLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            console.warn("CSV parsing warnings:", results.errors);
          }

          if (!results.data || results.data.length === 0) {
            throw new Error("CSV file is empty");
          }

          processCSVData(results.data);
        } catch (err) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsLoading(false);
      }
    });
  };

  const loadSampleData = () => {
    setIsLoading(true);
    Papa.parse(SAMPLE_CSV, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          processCSVData(results.data);
        } catch (err) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  /* ===============================
      Player Lookups
  ================================ */

  const playerMap = useMemo(() => {
    const map = new Map();
    players.forEach((p) => map.set(normalize(p.Player), p));
    return map;
  }, [players]);

  const autocompleteList = useMemo(
    () => players.map((p) => p.Player).filter(Boolean),
    [players]
  );

  /* ===============================
      Trade Calculations
  ================================ */

  const calculateTradeData = (teamNames) => {
    const stats = { 
      score: 0, 
      salary: 0, 
      age: 0, 
      count: 0, 
      taTotal: 0,
      G: 0,
      A: 0,
      PIM: 0,
      PPP: 0,
      SOG: 0
    };
    const positions = {};
    const playerDetails = [];

    teamNames.forEach((name) => {
      if (!name.trim()) return;
      
      const p = playerMap.get(normalize(name));
      if (!p) return;

      playerDetails.push(p);
      stats.score += parseFloat(p.Score) || 0;
      stats.salary += parseFloat(p.Salary) || 0;
      stats.age += parseFloat(p.Age) || 0;
      stats.taTotal += p.taScore || 0;
      stats.G += parseFloat(p.G) || 0;
      stats.A += parseFloat(p.A) || 0;
      stats.PIM += parseFloat(p.PIM) || 0;
      stats.PPP += parseFloat(p.PPP) || 0;
      stats.SOG += parseFloat(p.SOG) || 0;
      stats.count++;

      const posArray = p.Position ? p.Position.split(",").map(s => s.trim()) : ["?"];
      posArray.forEach(pos => {
        positions[pos] = (positions[pos] || 0) + 1;
      });
    });

    return { 
      ...stats, 
      avgAge: stats.count > 0 ? (stats.age / stats.count).toFixed(1) : 0,
      positions,
      playerDetails
    };
  };

  const dataA = calculateTradeData(teamA);
  const dataB = calculateTradeData(teamB);
  const dataC = showTeamC ? calculateTradeData(teamC) : null;

  /* ===============================
      Team Management
  ================================ */

  const updatePlayer = (team, setTeam, index, value) => {
    const copy = [...team];
    copy[index] = value;
    setTeam(copy);
  };

  const addPlayer = (team, setTeam) => {
    setTeam([...team, ""]);
  };

  const removePlayer = (team, setTeam, index) => {
    const copy = team.filter((_, i) => i !== index);
    if (copy.length === 0) copy.push("");
    setTeam(copy);
  };

  const resetAll = () => {
    setTeamA([""]);
    setTeamB([""]);
    setTeamC([]);
    setShowTeamC(false);
    setError(null);
  };

  /* ===============================
      Export Functionality
  ================================ */

  const exportResults = () => {
    const results = `
FANTASY HOCKEY TRADE ANALYSIS
Generated: ${new Date().toLocaleString()}

TEAM A (RECEIVING):
Players: ${teamA.filter(n => n.trim()).join(", ") || "None"}
Total Score: ${dataA.score.toFixed(2)}
Average Age: ${dataA.avgAge}
Total Salary: ${dataA.salary.toLocaleString()}
TA Score: ${dataA.taTotal.toFixed(2)}
Stats: ${dataA.G}G, ${dataA.A}A, ${dataA.PIM}PIM, ${dataA.PPP}PPP, ${dataA.SOG}SOG

TEAM B (RECEIVING):
Players: ${teamB.filter(n => n.trim()).join(", ") || "None"}
Total Score: ${dataB.score.toFixed(2)}
Average Age: ${dataB.avgAge}
Total Salary: ${dataB.salary.toLocaleString()}
TA Score: ${dataB.taTotal.toFixed(2)}
Stats: ${dataB.G}G, ${dataB.A}A, ${dataB.PIM}PIM, ${dataB.PPP}PPP, ${dataB.SOG}SOG

${showTeamC ? `TEAM C (RECEIVING):
Players: ${teamC.filter(n => n.trim()).join(", ") || "None"}
Total Score: ${dataC.score.toFixed(2)}
Average Age: ${dataC.avgAge}
Total Salary: ${dataC.salary.toLocaleString()}
TA Score: ${dataC.taTotal.toFixed(2)}
Stats: ${dataC.G}G, ${dataC.A}A, ${dataC.PIM}PIM, ${dataC.PPP}PPP, ${dataC.SOG}SOG
` : ""}
TRADE VERDICT:
Net Score Impact (A vs B): ${(dataA.score - dataB.score).toFixed(2)}
Relative Value Difference: ${(dataA.taTotal - dataB.taTotal).toFixed(2)}
Winner: ${dataA.taTotal > dataB.taTotal ? "Team A" : dataA.taTotal < dataB.taTotal ? "Team B" : "Even Trade"}
    `.trim();

    const blob = new Blob([results], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-analysis-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ===============================
      Render Team Column
  ================================ */

  const renderTeamColumn = (label, team, setTeam, results, bgColor) => (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <h3 className="text-lg font-bold mb-3 text-slate-800">{label}</h3>
      
      {team.map((name, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <input
            list="players"
            value={name}
            placeholder="Type player name..."
            onChange={(e) => updatePlayer(team, setTeam, i, e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {team.length > 1 && (
            <button
              onClick={() => removePlayer(team, setTeam, i)}
              className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              title="Remove player"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      
      <button
        onClick={() => addPlayer(team, setTeam)}
        className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
      >
        + Add Player
      </button>

      {results.count > 0 && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-bold text-base mb-2">Summary</p>
            <p><strong>Total Score:</strong> {results.score.toFixed(2)}</p>
            <p><strong>Avg Age:</strong> {results.avgAge}</p>
            <p><strong>Salary:</strong> ${results.salary.toLocaleString()}</p>
            <p><strong>TA Score:</strong> {results.taTotal.toFixed(2)}</p>
          </div>

          {(results.G > 0 || results.A > 0) && (
            <div className="p-3 bg-white rounded border border-slate-200">
              <p className="font-bold mb-2">Stats Breakdown</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <p>G: {results.G}</p>
                <p>A: {results.A}</p>
                <p>PIM: {results.PIM}</p>
                <p>PPP: {results.PPP}</p>
                <p>SOG: {results.SOG}</p>
              </div>
            </div>
          )}

          {Object.keys(results.positions).length > 0 && (
            <div className="p-3 bg-white rounded border border-slate-200">
              <p className="font-bold mb-2">Positions</p>
              <p>{Object.entries(results.positions).map(([k, v]) => `${v} ${k}`).join(", ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ===============================
      Render
  ================================ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            🏒 Fantasy Hockey Trade Analyzer
          </h1>
          
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <label className="flex-1 cursor-pointer">
              <div className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium">
                {isLoading ? "Loading..." : "📁 Upload CSV"}
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleCSVUpload(e.target.files[0])}
                className="hidden"
                disabled={isLoading}
              />
            </label>
            
            <button
              onClick={loadSampleData}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              ✨ Load Sample Data
            </button>
            
            {players.length > 0 && (
              <>
                <button
                  onClick={resetAll}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium"
                >
                  🔄 Reset
                </button>
                <button
                  onClick={exportResults}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  💾 Export
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          {!error && players.length > 0 && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
              ✅ Loaded {players.length} players successfully
            </div>
          )}

          {!error && players.length === 0 && (
            <p className="text-sm text-slate-600">
              Upload your Fantrax Export CSV or use sample data to begin analyzing trades.
            </p>
          )}
        </header>

        {players.length > 0 && (
          <>
            <datalist id="players">
              {autocompleteList.map((p, i) => <option key={i} value={p} />)}
            </datalist>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              {renderTeamColumn("Team A (Receiving)", teamA, setTeamA, dataA, "blue")}
              {renderTeamColumn("Team B (Receiving)", teamB, setTeamB, dataB, "green")}
              
              {showTeamC ? (
                renderTeamColumn("Team C (Receiving)", teamC, setTeamC, dataC, "purple")
              ) : (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-center">
                  <button
                    onClick={() => {
                      setShowTeamC(true);
                      setTeamC([""]);
                    }}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    + Add 3rd Team
                  </button>
                </div>
              )}
            </div>

            {/* Trade Verdict */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-lg shadow-xl p-6">
              <h2 className="text-2xl font-bold mb-4">📊 Trade Verdict</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Net Impact */}
                <div className="bg-slate-700 bg-opacity-50 rounded-lg p-4">
                  <p className="text-sm text-slate-300 mb-2">Net Score Impact (A vs B)</p>
                  <div className="flex items-center gap-3">
                    <span 
                      className="text-4xl"
                      style={{ color: getImpactIcon(dataA.score - dataB.score).color }}
                    >
                      {getImpactIcon(dataA.score - dataB.score).icon}
                    </span>
                    <span className="text-3xl font-bold">
                      {(dataA.score - dataB.score).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Relative Value */}
                <div className="bg-slate-700 bg-opacity-50 rounded-lg p-4">
                  <p className="text-sm text-slate-300 mb-2">Relative Value (TA Score)</p>
                  <div className="space-y-1">
                    <p className="text-lg">Team A: <strong>{dataA.taTotal.toFixed(2)}</strong></p>
                    <p className="text-lg">Team B: <strong>{dataB.taTotal.toFixed(2)}</strong></p>
                    {showTeamC && dataC && (
                      <p className="text-lg">Team C: <strong>{dataC.taTotal.toFixed(2)}</strong></p>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    *Higher score = more elite talent vs league average
                  </p>
                </div>

                {/* Winner */}
                <div className="bg-slate-700 bg-opacity-50 rounded-lg p-4 md:col-span-2">
                  <p className="text-sm text-slate-300 mb-2">Trade Winner</p>
                  <p className="text-2xl font-bold">
                    {dataA.taTotal > dataB.taTotal + 0.1 ? "🏆 Team A" :
                     dataB.taTotal > dataA.taTotal + 0.1 ? "🏆 Team B" :
                     "🤝 Even Trade"}
                  </p>
                  {showTeamC && dataC && (
                    <p className="text-sm text-slate-300 mt-2">
                      Team C TA Score: {dataC.taTotal > Math.max(dataA.taTotal, dataB.taTotal) ? "🏆 Best Value" : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}