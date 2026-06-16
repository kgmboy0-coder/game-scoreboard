"use strict";

const STORAGE_KEY = "game-scoreboard-v1";
const DEFAULT_PLAYERS = ["Player 1", "Player 2", "Player 3", "Player 4"];
const DEFAULT_POINT_VALUE = 100;

const state = {
  data: loadData(),
  draftScores: {},
  editingRoundId: null,
  autoBalanceEnabled: true,
  autoBalancePlayerId: null,
  selectedRoundIds: new Set(),
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  ensureDraft();
  bindEvents();
  render();
  registerServiceWorker();
});

function bindElements() {
  [
    "new-session-button",
    "export-json-button",
    "export-csv-button",
    "import-json-input",
    "active-player-count",
    "round-count",
    "grand-total",
    "save-status",
    "round-validity",
    "point-value",
    "game-type",
    "round-note",
    "auto-balance-enabled",
    "auto-balance-player",
    "score-inputs",
    "round-total",
    "clear-round-button",
    "save-round-button",
    "add-player-button",
    "players-list",
    "standings",
    "round-history",
    "edit-selected-round-button",
    "delete-selected-rounds-button",
    "duplicate-selected-round-button",
  ].forEach((id) => {
    el[toCamel(id)] = document.getElementById(id);
  });
}

function bindEvents() {
  el.newSessionButton.addEventListener("click", () => {
    if (!confirm("현재 기록을 지우고 새 판을 시작할까요? JSON 백업이 필요하면 먼저 내보내기 하세요.")) {
      return;
    }
    state.data = createDefaultData();
    state.draftScores = {};
    state.editingRoundId = null;
    state.autoBalancePlayerId = null;
    state.selectedRoundIds.clear();
    ensureDraft();
    persist();
    render();
  });

  el.exportJsonButton.addEventListener("click", exportJson);
  el.exportCsvButton.addEventListener("click", exportCsv);
  el.importJsonInput.addEventListener("change", importJson);
  el.addPlayerButton.addEventListener("click", addPlayer);
  el.clearRoundButton.addEventListener("click", clearDraft);
  el.saveRoundButton.addEventListener("click", saveRound);
  el.editSelectedRoundButton.addEventListener("click", editSelectedRound);
  el.deleteSelectedRoundsButton.addEventListener("click", deleteSelectedRounds);
  el.duplicateSelectedRoundButton.addEventListener("click", duplicateSelectedRound);

  el.pointValue.addEventListener("input", () => {
    state.data.pointValue = Math.max(0, parseScore(el.pointValue.value));
    persist();
    renderStandings();
    renderStatusOnly();
  });

  el.gameType.addEventListener("input", renderStatusOnly);
  el.roundNote.addEventListener("input", renderStatusOnly);

  el.autoBalanceEnabled.addEventListener("change", () => {
    state.autoBalanceEnabled = el.autoBalanceEnabled.checked;
    ensureDraft();
    renderScoreInputs();
    renderStatusOnly();
  });

  el.autoBalancePlayer.addEventListener("change", () => {
    state.autoBalancePlayerId = el.autoBalancePlayer.value;
    ensureDraft();
    renderScoreInputs();
    renderStatusOnly();
  });
}

function createDefaultData() {
  return {
    version: 1,
    sessionName: todaySessionName(),
    pointValue: DEFAULT_POINT_VALUE,
    players: DEFAULT_PLAYERS.map((name) => ({
      id: uid("p"),
      name,
      active: true,
    })),
    rounds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadData() {
  const fallback = createDefaultData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    return normalizeData(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load saved data.", error);
    return fallback;
  }
}

function normalizeData(input) {
  const data = input && typeof input === "object" ? input : {};
  const players = Array.isArray(data.players) ? data.players : [];
  const normalizedPlayers = players
    .filter((player) => player && typeof player === "object")
    .map((player, index) => ({
      id: String(player.id || uid("p")),
      name: String(player.name || `Player ${index + 1}`),
      active: player.active !== false,
    }));

  const finalPlayers = normalizedPlayers.length ? normalizedPlayers : createDefaultData().players;
  const playerIds = new Set(finalPlayers.map((player) => player.id));
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const normalizedRounds = rounds
    .filter((round) => round && typeof round === "object")
    .map((round) => {
      const scores = {};
      const rawScores = round.scores && typeof round.scores === "object" ? round.scores : {};
      Object.entries(rawScores).forEach(([playerId, value]) => {
        if (playerIds.has(playerId)) {
          scores[playerId] = parseScore(value);
        }
      });
      return {
        id: String(round.id || uid("r")),
        createdAt: String(round.createdAt || new Date().toISOString()),
        gameType: String(round.gameType || "기타"),
        note: String(round.note || ""),
        scores,
      };
    });

  return {
    version: 1,
    sessionName: String(data.sessionName || todaySessionName()),
    pointValue: normalizePointValue(data.pointValue),
    players: finalPlayers,
    rounds: normalizedRounds,
    createdAt: String(data.createdAt || new Date().toISOString()),
    updatedAt: String(data.updatedAt || new Date().toISOString()),
  };
}

function persist() {
  state.data.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  el.saveStatus.textContent = "저장됨";
}

function render() {
  el.pointValue.value = String(getPointValue());
  el.autoBalanceEnabled.checked = state.autoBalanceEnabled;
  renderAutoBalanceOptions();
  renderScoreInputs();
  renderPlayers();
  renderStandings();
  renderHistory();
  renderStatusOnly();
}

function renderStatusOnly() {
  const activePlayers = getActivePlayers();
  const standings = calculateStandings();
  const grandTotal = standings.reduce((sum, item) => sum + item.total, 0);
  const roundTotal = calculateDraftTotal();
  const canSave = activePlayers.length >= 2 && roundTotal === 0;

  el.activePlayerCount.textContent = String(activePlayers.length);
  el.roundCount.textContent = String(state.data.rounds.length);
  el.grandTotal.textContent = formatScore(grandTotal);
  el.grandTotal.className = scoreClass(grandTotal);
  el.roundTotal.textContent = formatScore(roundTotal);
  el.roundTotal.className = `round-total ${scoreClass(roundTotal)}`;

  el.roundValidity.className = `validity ${canSave ? "ok" : "bad"}`;
  el.roundValidity.textContent = canSave ? "합계 0" : "확인 필요";
  el.saveRoundButton.disabled = !canSave;
  updateHistoryToolbar();
}

function renderAutoBalanceOptions() {
  const activePlayers = getActivePlayers();
  if (!activePlayers.some((player) => player.id === state.autoBalancePlayerId)) {
    state.autoBalancePlayerId = activePlayers[activePlayers.length - 1]?.id || null;
  }
  el.autoBalancePlayer.innerHTML = "";
  activePlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    option.selected = player.id === state.autoBalancePlayerId;
    el.autoBalancePlayer.append(option);
  });
}

function renderScoreInputs() {
  ensureDraft();
  renderAutoBalanceOptions();
  el.scoreInputs.innerHTML = "";

  const template = document.getElementById("score-row-template");
  getActivePlayers().forEach((player) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".score-row");
    const name = fragment.querySelector(".score-name");
    const input = fragment.querySelector(".score-value");
    const quickButtons = fragment.querySelector(".quick-buttons");
    const isAutoTarget = state.autoBalanceEnabled && player.id === state.autoBalancePlayerId;

    row.dataset.playerId = player.id;
    name.textContent = player.name;
    input.value = String(state.draftScores[player.id] || 0);
    input.disabled = isAutoTarget;
    input.setAttribute("aria-label", `${player.name} 점수`);

    input.addEventListener("input", () => {
      state.draftScores[player.id] = parseScore(input.value);
      ensureDraft();
      syncScoreInputValues(player.id);
      renderStatusOnly();
    });

    quickButtons.querySelectorAll("button").forEach((button) => {
      button.disabled = isAutoTarget;
      button.addEventListener("click", () => {
        const delta = parseScore(button.dataset.delta);
        state.draftScores[player.id] = parseScore(state.draftScores[player.id]) + delta;
        ensureDraft();
        renderScoreInputs();
        renderStatusOnly();
      });
    });

    el.scoreInputs.append(fragment);
  });
}

function renderPlayers() {
  el.playersList.innerHTML = "";
  state.data.players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player-row";

    const label = document.createElement("label");
    label.textContent = "이름";
    const input = document.createElement("input");
    input.type = "text";
    input.value = player.name;
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      player.name = input.value.trim() || "이름 없음";
      persist();
      renderAutoBalanceOptions();
      renderScoreInputs();
      renderStandings();
      renderHistory();
    });
    label.append(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `ghost-button toggle-button ${player.active ? "active" : "inactive"}`;
    toggle.textContent = player.active ? "활성" : "비활성";
    toggle.addEventListener("click", () => {
      const activeCount = getActivePlayers().length;
      if (player.active && activeCount <= 2) {
        alert("활성 참가자는 최소 2명이어야 합니다.");
        return;
      }
      player.active = !player.active;
      ensureDraft();
      persist();
      render();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-button";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => removePlayer(player.id));

    row.append(label, toggle, remove);
    el.playersList.append(row);
  });
}

function syncScoreInputValues(skipPlayerId = null) {
  el.scoreInputs.querySelectorAll(".score-row").forEach((row) => {
    const playerId = row.dataset.playerId;
    if (playerId === skipPlayerId) {
      return;
    }
    const input = row.querySelector(".score-value");
    if (input) {
      input.value = String(state.draftScores[playerId] || 0);
    }
  });
}

function renderStandings() {
  const standings = calculateStandings();
  el.standings.innerHTML = "";

  if (!standings.length) {
    el.standings.append(emptyState("참가자를 추가하세요."));
    return;
  }

  const table = document.createElement("table");
  table.className = "score-table standings-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(tableHeader("구분"));
  standings.forEach((item) => {
    headRow.append(playerHeader(item));
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  const scoreRow = document.createElement("tr");
  scoreRow.append(tableHeader("점수", "row"));
  standings.forEach((item) => {
    const cell = document.createElement("td");
    cell.className = scoreClass(item.total);
    const point = document.createElement("div");
    point.className = "standings-point";
    point.textContent = formatPointScore(item.total);
    const money = document.createElement("div");
    money.className = "standings-money";
    money.textContent = formatMoney(item.total * getPointValue());
    cell.append(point, money);
    scoreRow.append(cell);
  });
  tbody.append(scoreRow);

  table.append(thead, tbody);
  el.standings.append(table);
}

function renderHistory() {
  el.roundHistory.innerHTML = "";
  if (!state.data.rounds.length) {
    state.selectedRoundIds.clear();
    el.roundHistory.append(emptyState("아직 저장된 라운드가 없습니다."));
    updateHistoryToolbar();
    return;
  }

  const table = document.createElement("table");
  table.className = "score-table history-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["라운드", "게임", "메모"].forEach((label) => headRow.append(tableHeader(label)));
  state.data.players.forEach((player) => {
    headRow.append(playerHeader(player));
  });
  ["합계", "선택"].forEach((label) => headRow.append(tableHeader(label)));
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  [...state.data.rounds].reverse().forEach((round, reverseIndex) => {
    const roundNumber = state.data.rounds.length - reverseIndex;
    const row = document.createElement("tr");
    row.append(tableCell(`${roundNumber}R`));
    row.append(tableCell(round.gameType));
    row.append(tableCell(round.note || formatDate(round.createdAt), "history-note-cell"));
    let total = 0;
    state.data.players.forEach((player) => {
      const score = parseScore(round.scores[player.id]);
      total += score;
      const cell = tableCell(formatScore(score));
      cell.className = scoreClass(score);
      row.append(cell);
    });
    const totalCell = tableCell(formatScore(total));
    totalCell.className = scoreClass(total);
    row.append(totalCell);

    const selectCell = document.createElement("td");
    selectCell.className = "history-select-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "round-select-checkbox";
    checkbox.checked = state.selectedRoundIds.has(round.id);
    checkbox.setAttribute("aria-label", `${roundNumber}R 선택`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedRoundIds.add(round.id);
      } else {
        state.selectedRoundIds.delete(round.id);
      }
      updateHistoryToolbar();
    });
    selectCell.append(checkbox);
    row.append(selectCell);
    tbody.append(row);
  });
  table.append(thead, tbody);
  el.roundHistory.append(table);
  updateHistoryToolbar();
}

function addPlayer() {
  const nextNumber = state.data.players.length + 1;
  const player = {
    id: uid("p"),
    name: `Player ${nextNumber}`,
    active: true,
  };
  state.data.players.push(player);
  state.draftScores[player.id] = 0;
  state.autoBalancePlayerId = player.id;
  persist();
  render();
}

function removePlayer(playerId) {
  const player = state.data.players.find((item) => item.id === playerId);
  if (!player) {
    return;
  }
  if (player.active && getActivePlayers().length <= 2) {
    alert("활성 참가자는 최소 2명이어야 합니다.");
    return;
  }
  const hasHistory = state.data.rounds.some((round) => Object.prototype.hasOwnProperty.call(round.scores, playerId));
  if (hasHistory) {
    player.active = false;
    alert("기록이 있는 참가자는 삭제하지 않고 비활성 처리했습니다.");
  } else {
    state.data.players = state.data.players.filter((item) => item.id !== playerId);
    delete state.draftScores[playerId];
  }
  ensureDraft();
  persist();
  render();
}

function saveRound() {
  ensureDraft();
  const total = calculateDraftTotal();
  if (total !== 0) {
    alert(`라운드 합계가 ${formatScore(total)}입니다. 합계가 0이어야 저장할 수 있습니다.`);
    return;
  }

  const scores = {};
  getActivePlayers().forEach((player) => {
    scores[player.id] = parseScore(state.draftScores[player.id]);
  });

  const payload = {
    id: state.editingRoundId || uid("r"),
    createdAt: state.editingRoundId
      ? state.data.rounds.find((round) => round.id === state.editingRoundId)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    gameType: el.gameType.value || "기타",
    note: el.roundNote.value.trim(),
    scores,
  };

  if (state.editingRoundId) {
    state.data.rounds = state.data.rounds.map((round) => (round.id === state.editingRoundId ? payload : round));
  } else {
    state.data.rounds.push(payload);
  }

  state.editingRoundId = null;
  state.selectedRoundIds.clear();
  clearDraft(false);
  persist();
  render();
}

function clearDraft(shouldRender = true) {
  state.draftScores = {};
  state.editingRoundId = null;
  state.selectedRoundIds.clear();
  el.roundNote.value = "";
  ensureDraft();
  if (shouldRender) {
    render();
  }
}

function editRound(roundId) {
  const round = state.data.rounds.find((item) => item.id === roundId);
  if (!round) {
    return;
  }
  state.editingRoundId = round.id;
  state.selectedRoundIds.clear();
  state.draftScores = {};
  state.data.players.forEach((player) => {
    state.draftScores[player.id] = parseScore(round.scores[player.id]);
    if (Object.prototype.hasOwnProperty.call(round.scores, player.id)) {
      player.active = true;
    }
  });
  el.gameType.value = round.gameType;
  el.roundNote.value = round.note;
  state.autoBalanceEnabled = false;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicateRound(roundId) {
  const round = state.data.rounds.find((item) => item.id === roundId);
  if (!round) {
    return;
  }
  state.editingRoundId = null;
  state.selectedRoundIds.clear();
  state.draftScores = {};
  Object.entries(round.scores).forEach(([playerId, score]) => {
    state.draftScores[playerId] = parseScore(score);
  });
  el.gameType.value = round.gameType;
  el.roundNote.value = round.note;
  state.autoBalanceEnabled = false;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRound(roundId) {
  if (!confirm("이 라운드를 삭제할까요?")) {
    return;
  }
  state.data.rounds = state.data.rounds.filter((round) => round.id !== roundId);
  state.selectedRoundIds.delete(roundId);
  if (state.editingRoundId === roundId) {
    state.editingRoundId = null;
    clearDraft(false);
  }
  persist();
  render();
}

function editSelectedRound() {
  const roundId = singleSelectedRoundId();
  if (!roundId) {
    return;
  }
  editRound(roundId);
}

function duplicateSelectedRound() {
  const roundId = singleSelectedRoundId();
  if (!roundId) {
    return;
  }
  duplicateRound(roundId);
}

function deleteSelectedRounds() {
  const selectedIds = [...state.selectedRoundIds];
  if (!selectedIds.length) {
    return;
  }
  const message = selectedIds.length === 1 ? "선택한 라운드를 삭제할까요?" : `선택한 ${selectedIds.length}개 라운드를 삭제할까요?`;
  if (!confirm(message)) {
    return;
  }
  const selectedSet = new Set(selectedIds);
  state.data.rounds = state.data.rounds.filter((round) => !selectedSet.has(round.id));
  if (state.editingRoundId && selectedSet.has(state.editingRoundId)) {
    state.editingRoundId = null;
    clearDraft(false);
  }
  state.selectedRoundIds.clear();
  persist();
  render();
}

function singleSelectedRoundId() {
  if (state.selectedRoundIds.size !== 1) {
    return null;
  }
  return [...state.selectedRoundIds][0] || null;
}

function updateHistoryToolbar() {
  const count = state.selectedRoundIds.size;
  const hasSingleSelection = count === 1;
  el.editSelectedRoundButton.disabled = !hasSingleSelection;
  el.duplicateSelectedRoundButton.disabled = !hasSingleSelection;
  el.deleteSelectedRoundsButton.disabled = count === 0;
}

function ensureDraft() {
  const activePlayers = getActivePlayers();
  activePlayers.forEach((player) => {
    if (!Object.prototype.hasOwnProperty.call(state.draftScores, player.id)) {
      state.draftScores[player.id] = 0;
    }
  });

  if (!activePlayers.some((player) => player.id === state.autoBalancePlayerId)) {
    state.autoBalancePlayerId = activePlayers[activePlayers.length - 1]?.id || null;
  }

  if (state.autoBalanceEnabled && state.autoBalancePlayerId) {
    const otherTotal = activePlayers.reduce((sum, player) => {
      if (player.id === state.autoBalancePlayerId) {
        return sum;
      }
      return sum + parseScore(state.draftScores[player.id]);
    }, 0);
    state.draftScores[state.autoBalancePlayerId] = -otherTotal;
  }
}

function calculateDraftTotal() {
  ensureDraft();
  return getActivePlayers().reduce((sum, player) => sum + parseScore(state.draftScores[player.id]), 0);
}

function calculateStandings() {
  return state.data.players.map((player) => {
    const total = state.data.rounds.reduce((sum, round) => sum + parseScore(round.scores[player.id]), 0);
    return {
      id: player.id,
      name: player.name,
      active: player.active,
      total,
    };
  });
}

function getActivePlayers() {
  return state.data.players.filter((player) => player.active);
}

function tableHeader(text, scope = "col") {
  const cell = document.createElement("th");
  cell.scope = scope;
  cell.textContent = text;
  return cell;
}

function playerHeader(player) {
  const cell = document.createElement("th");
  cell.scope = "col";
  const name = document.createElement("span");
  name.className = "player-header-name";
  name.textContent = player.name;
  cell.append(name);
  if (!player.active) {
    const badge = document.createElement("span");
    badge.className = "inactive-badge";
    badge.textContent = "비활성";
    cell.append(badge);
  }
  return cell;
}

function tableCell(text, className = "") {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  cell.textContent = text;
  return cell;
}

function emptyState(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}

function exportJson() {
  downloadFile(
    `${safeFilename(state.data.sessionName)}.json`,
    JSON.stringify(state.data, null, 2),
    "application/json"
  );
}

function exportCsv() {
  const players = state.data.players;
  const header = ["round", "createdAt", "gameType", "note", ...players.map((player) => player.name), "total"];
  const rows = state.data.rounds.map((round, index) => {
    const scores = players.map((player) => parseScore(round.scores[player.id]));
    const total = scores.reduce((sum, score) => sum + score, 0);
    return [index + 1, round.createdAt, round.gameType, round.note, ...scores, total];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile(`${safeFilename(state.data.sessionName)}.csv`, csv, "text/csv;charset=utf-8");
}

function importJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeData(JSON.parse(String(reader.result || "{}")));
      state.data = imported;
      state.draftScores = {};
      state.editingRoundId = null;
      state.autoBalancePlayerId = null;
      state.selectedRoundIds.clear();
      ensureDraft();
      persist();
      render();
    } catch (error) {
      alert("JSON 파일을 읽을 수 없습니다.");
      console.error(error);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.info("Service worker registration skipped.", error);
  });
}

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseScore(value) {
  const number = Number.parseInt(String(value ?? "0").replace(/,/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function normalizePointValue(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_POINT_VALUE;
  }
  const number = parseScore(value);
  return number >= 0 ? number : DEFAULT_POINT_VALUE;
}

function getPointValue() {
  return normalizePointValue(state.data.pointValue);
}

function formatScore(value) {
  const number = parseScore(value);
  return number > 0 ? `+${number.toLocaleString("ko-KR")}` : number.toLocaleString("ko-KR");
}

function formatPointScore(value) {
  return `${formatScore(value)}점`;
}

function formatMoney(value) {
  const number = parseScore(value);
  return number > 0 ? `+${number.toLocaleString("ko-KR")}원` : `${number.toLocaleString("ko-KR")}원`;
}

function scoreClass(value) {
  const number = parseScore(value);
  if (number > 0) {
    return "score-positive";
  }
  if (number < 0) {
    return "score-negative";
  }
  return "score-zero";
}

function todaySessionName() {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${formatter.format(new Date())} 게임`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilename(name) {
  return String(name || "game-scoreboard")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
