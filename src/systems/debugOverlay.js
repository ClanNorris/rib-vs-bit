export function createDebugOverlaySystem(scene, options = {}) {
  const {
    players,
    x = 12,
    y = 12,
    depth = 5000,
    fontSize = '14px',
    title = 'DEBUG OVERLAY',
    transitionFlashMs = 900,
    maxEventLogEntries = 6,
  } = options;

  let destroyed = false;
  let visible = false;

  const lastStateByPlayer = {
    red: players?.red?.state ?? 'unknown',
    blue: players?.blue?.state ?? 'unknown',
  };

  let lastRoundPhase = scene.roundGate?.getPhase?.() ?? 'unknown';
  let lastLaneSummary = scene.lanePlanDebugSummary ?? '';

  const flashUntilByPlayer = {
    red: 0,
    blue: 0,
  };

  let roundFlashUntil = 0;

  const eventLog = [];

  const COLORS = {
    title: '#f3f4f6',
    panelBorder: 0xf8d66d,
    panelText: '#e5e7eb',

    ribBase: '#ff6b6b',
    bitBase: '#60a5fa',

    alive: '#86efac',
    dying: '#fca5a5',
    respawning: '#fcd34d',
    invulnerable: '#67e8f9',
    unknown: '#d1d5db',

    roundLive: '#86efac',
    roundCountdown: '#fcd34d',
    roundPause: '#fca5a5',
    roundMenu: '#cbd5e1',
    roundGameOver: '#f9a8d4',

    flash: '#fde68a',
    event: '#fef3c7',
  };

  const panel = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.56);
  panel.setOrigin(0, 0);
  panel.setStrokeStyle(2, COLORS.panelBorder, 0.85);

  const titleText = scene.add.text(8, 6, title, {
    fontFamily: 'monospace',
    fontSize,
    color: COLORS.title,
    fontStyle: 'bold',
  });
  titleText.setOrigin(0, 0);

  const roundText = scene.add.text(8, 28, '', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: COLORS.panelText,
  });
  roundText.setOrigin(0, 0);

  const hazardGraceText = scene.add.text(8, 46, '', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: COLORS.panelText,
  });
  hazardGraceText.setOrigin(0, 0);

  const laneText = scene.add.text(8, 64, '', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: COLORS.panelText,
    wordWrap: { width: 680, useAdvancedWrap: false },
  });
  laneText.setOrigin(0, 0);

  const ribText = scene.add.text(8, 104, '', {
    fontFamily: 'monospace',
    fontSize,
    color: COLORS.ribBase,
  });
  ribText.setOrigin(0, 0);

  const bitText = scene.add.text(8, 170, '', {
    fontFamily: 'monospace',
    fontSize,
    color: COLORS.bitBase,
  });
  bitText.setOrigin(0, 0);

  const eventHeaderText = scene.add.text(8, 236, 'EVENTS', {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: COLORS.title,
    fontStyle: 'bold',
  });
  eventHeaderText.setOrigin(0, 0);

  const eventTexts = [];
  for (let i = 0; i < maxEventLogEntries; i += 1) {
    const eventText = scene.add.text(8, 256 + i * 18, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: COLORS.event,
    });
    eventText.setOrigin(0, 0);
    eventTexts.push(eventText);
  }

  const container = scene.add.container(x, y, [
    panel,
    titleText,
    roundText,
    hazardGraceText,
    laneText,
    ribText,
    bitText,
    eventHeaderText,
    ...eventTexts,
  ]);

  container.setScrollFactor(0);
  container.setDepth(depth);
  container.setVisible(false);

  function getInvulnRemaining(player, now) {
    return Math.max(0, Math.ceil((player?.respawnInvulnUntil ?? 0) - now));
  }

  function getDeathCauseText(player) {
    return player?.deathCause ?? '-';
  }

  function getStateColor(state) {
    switch (state) {
      case 'alive':
        return COLORS.alive;
      case 'dying':
        return COLORS.dying;
      case 'respawning':
        return COLORS.respawning;
      case 'invulnerable':
        return COLORS.invulnerable;
      default:
        return COLORS.unknown;
    }
  }

  function getRoundColor(phase) {
    switch (phase) {
      case 'live':
        return COLORS.roundLive;
      case 'countdown':
        return COLORS.roundCountdown;
      case 'scorePause':
        return COLORS.roundPause;
      case 'menu':
        return COLORS.roundMenu;
      case 'gameOver':
        return COLORS.roundGameOver;
      default:
        return COLORS.panelText;
    }
  }

  function getPlayerLabelColor(playerId) {
    return playerId === 'red' ? COLORS.ribBase : COLORS.bitBase;
  }

  function getSupportLine(player) {
    const snapshot = scene.platformSupport?.getSupportSnapshot?.(player) ?? null;
    const support = snapshot?.supported ? 'yes' : 'no';
    const type = snapshot?.platformType ?? 'none';
    const overlap = snapshot?.overlapPx ?? 0;
    const footprint = snapshot?.footprintPx ?? 0;
    const carried = snapshot?.carriedThisFrame ? 'yes' : 'no';
    const afterMove = snapshot?.unsupportedAfterMove ? 'yes' : 'no';
    const afterCarry = snapshot?.unsupportedAfterCarry ? 'yes' : 'no';

    return `support:${support} type:${type} overlap:${overlap}px footprint:${footprint}px carried:${carried} lostAfterMove:${afterMove} lostAfterCarry:${afterCarry}`;
  }

  function getRiverAnchorLine(player) {
    const snapshot = scene.movement?.getRiverAnchorDebugSnapshot?.(player) ?? null;

    const supported = snapshot?.supported ? 'yes' : 'no';
    const type = snapshot?.supportedPlatformType ?? 'none';
    const row = snapshot?.supportedPlatformRow ?? '-';
    const center = snapshot?.platformCenterCol ?? '-';
    const visual = snapshot?.nearestVisualCol ?? '-';
    const anchor = snapshot?.anchoredCol ?? '-';
    const base = snapshot?.baseColUsed ?? '-';
    const slots = snapshot?.slotColsText ?? '-';

    return `anchor support:${supported} type:${type} row:${row} center:${center} visual:${visual} anchor:${anchor} base:${base} slots:${slots}`;
  }

  function buildPlayerLine(label, player, now) {
    const row = player?.row ?? '-';
    const col = player?.col ?? '-';
    const state = player?.state ?? 'unknown';
    const deathCause = getDeathCauseText(player);
    const invulnRemaining = getInvulnRemaining(player, now);
    const supportLine = getSupportLine(player);
    const anchorLine = getRiverAnchorLine(player);

    return `${label} -> row:${row} col:${col} | state:${state} | cause:${deathCause} | invuln:${invulnRemaining}ms
      ${supportLine}
      ${anchorLine}`;
  }

  function buildRoundLine(now) {
    const roundGate = scene.roundGate;
    const phase = roundGate?.getPhase?.() ?? 'unknown';
    const world = roundGate?.isWorldRunning?.() ? 'on' : 'off';
    const input = roundGate?.isInputEnabled?.() ? 'on' : 'off';
    const carry = roundGate?.isCarryEnabled?.() ? 'on' : 'off';
    const hazards = roundGate?.areHazardsEnabled?.(now) ? 'on' : 'off';
    const score = roundGate?.isScoringEnabled?.() ? 'on' : 'off';

    return `ROUND -> ${phase} | world:${world} input:${input} carry:${carry} hazards:${hazards} score:${score}`;
  }

  function buildHazardGraceLine(now) {
    const roundGate = scene.roundGate;
    const phase = roundGate?.getPhase?.() ?? 'unknown';

    if (phase !== 'live') {
      return 'HAZARD GRACE -> n/a';
    }

    if (roundGate?.areHazardsEnabled?.(now)) {
      return 'HAZARD GRACE -> live';
    }

    const enableAt = roundGate?.getHazardsEnableAt?.() ?? now;
    const remainingMs = Math.max(0, Math.ceil(enableAt - now));

    return `HAZARD GRACE -> ${remainingMs}ms`;
  }

  function buildLaneLine() {
    return `LANES -> ${scene.lanePlanDebugSummary ?? '-'}`;
  }

  function pushEvent(message) {
    const timestamp = Math.floor(scene.time.now);
    eventLog.unshift({
      at: scene.time.now,
      text: `[${timestamp}ms] ${message}`,
    });

    if (eventLog.length > maxEventLogEntries) {
      eventLog.length = maxEventLogEntries;
    }
  }

  function pushTransitionEvent(label, fromState, toState, player) {
    const cause = player?.deathCause ? ` | cause:${player.deathCause}` : '';
    pushEvent(`${label} ${fromState} -> ${toState}${cause}`);
  }

  function checkStateTransitions(now) {
    const redState = players?.red?.state ?? 'unknown';
    const blueState = players?.blue?.state ?? 'unknown';

    if (redState !== lastStateByPlayer.red) {
      pushTransitionEvent('RIB', lastStateByPlayer.red, redState, players?.red);
      lastStateByPlayer.red = redState;
      flashUntilByPlayer.red = now + transitionFlashMs;
    }

    if (blueState !== lastStateByPlayer.blue) {
      pushTransitionEvent('BIT', lastStateByPlayer.blue, blueState, players?.blue);
      lastStateByPlayer.blue = blueState;
      flashUntilByPlayer.blue = now + transitionFlashMs;
    }
  }

  function checkRoundTransitions(now) {
    const phase = scene.roundGate?.getPhase?.() ?? 'unknown';

    if (phase !== lastRoundPhase) {
      pushEvent(`ROUND ${lastRoundPhase} -> ${phase}`);
      lastRoundPhase = phase;
      roundFlashUntil = now + transitionFlashMs;
    }

    const laneSummary = scene.lanePlanDebugSummary ?? '';
    if (laneSummary && laneSummary !== lastLaneSummary) {
      pushEvent(`LANES ${laneSummary}`);
      lastLaneSummary = laneSummary;
    }
  }

  function updatePlayerVisual(textObject, playerId, player, now, label) {
    const state = player?.state ?? 'unknown';
    const stateColor = getStateColor(state);
    const baseColor = getPlayerLabelColor(playerId);
    const isFlashing = now < flashUntilByPlayer[playerId];

    textObject.setText(buildPlayerLine(label, player, now));
    textObject.setColor(isFlashing ? COLORS.flash : stateColor);

    if (!isFlashing && state === 'unknown') {
      textObject.setColor(baseColor);
    }
  }

  function updateRoundVisual(now) {
    const phase = scene.roundGate?.getPhase?.() ?? 'unknown';
    const isFlashing = now < roundFlashUntil;

    roundText.setText(buildRoundLine(now));
    roundText.setColor(isFlashing ? COLORS.flash : getRoundColor(phase));

    hazardGraceText.setText(buildHazardGraceLine(now));
    hazardGraceText.setColor(COLORS.panelText);
    hazardGraceText.setAlpha(0.95);

    laneText.setText(buildLaneLine());
    laneText.setColor(COLORS.panelText);
    laneText.setAlpha(0.95);
  }

  function updateEventLogVisuals() {
    for (let i = 0; i < eventTexts.length; i += 1) {
      const entry = eventLog[i];

      if (!entry) {
        eventTexts[i].setText('');
        continue;
      }

      eventTexts[i].setText(entry.text);
      eventTexts[i].setColor(i === 0 ? COLORS.flash : COLORS.event);
      eventTexts[i].setAlpha(i === 0 ? 1 : Math.max(0.45, 1 - i * 0.12));
    }
  }

  function resizePanel() {
    const widths = [
      titleText.width,
      roundText.width,
      hazardGraceText.width,
      laneText.width,
      ribText.width,
      bitText.width,
      eventHeaderText.width,
      ...eventTexts.map((t) => t.width),
    ];

    const maxWidth = Math.max(...widths, 420);
    const lastEventText = eventTexts[eventTexts.length - 1];
    const bottomY = lastEventText.y + lastEventText.height;

    panel.width = Math.ceil(maxWidth + 16);
    panel.height = Math.ceil(bottomY + 8);
  }

  function refresh(now) {
    updateRoundVisual(now);
    updatePlayerVisual(ribText, 'red', players?.red, now, 'RIB');
    updatePlayerVisual(bitText, 'blue', players?.blue, now, 'BIT');
    updateEventLogVisuals();
    resizePanel();
  }

  function toggle(forceValue) {
    if (destroyed) return;

    visible = typeof forceValue === 'boolean' ? forceValue : !visible;
    container.setVisible(visible);

    if (visible) {
      refresh(scene.time.now);
    }
  }

  function isVisible() {
    return visible;
  }

  function update() {
    if (destroyed || !visible) return;

    const now = scene.time.now;
    checkStateTransitions(now);
    checkRoundTransitions(now);
    refresh(now);
  }

  function destroy() {
    destroyed = true;
    container.destroy(true);
  }

  return {
    toggle,
    isVisible,
    update,
    destroy,
  };
}