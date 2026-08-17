const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('../client/node_modules/socket.io-client');

const projectRoot = path.resolve(__dirname, '..');
const port = 32000 + (process.pid % 1000);
const url = `http://127.0.0.1:${port}`;

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    function listener(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    }
    socket.on(event, listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Server did not become ready');
}

async function connectClient() {
  const socket = io(url, { autoConnect: false, forceNew: true, reconnection: false });
  const connected = waitForEvent(socket, 'connect');
  const roster = waitForEvent(socket, 'roster');
  socket.connect();
  await connected;
  return { socket, roster: await roster };
}

test('authorizes game events, rate limits abuse, and reconnects the same player', { timeout: 15000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), RECONNECT_GRACE_MS: '100' },
    stdio: 'ignore',
  });
  const sockets = [];
  try {
    await waitForHttp();
    const playerClient = await connectClient();
    const outsiderClient = await connectClient();
    sockets.push(playerClient.socket, outsiderClient.socket);

    const character = playerClient.roster.find((entry) => !entry.locked);
    assert.ok(character, 'an unlocked character is required for the test');

    let latestPlayerState = null;
    playerClient.socket.on('state', (state) => { latestPlayerState = state; });
    const joined = waitForEvent(playerClient.socket, 'joined');
    const lobbyState = waitForEvent(playerClient.socket, 'state', (state) => state.gameState === 'LOBBY');
    playerClient.socket.emit('join', { name: 'Reconnect Test', position: 1, characterId: character.id });
    const { sessionToken } = await joined;
    const initialState = await lobbyState;
    const playerId = initialState.youId;
    assert.ok(sessionToken);
    assert.equal('sessionToken' in initialState.players[0], false, 'session token must stay private');

    outsiderClient.socket.emit('startGame');
    await delay(200);
    assert.equal(latestPlayerState.gameState, 'LOBBY', 'an unjoined socket cannot start the match');

    const limited = waitForEvent(outsiderClient.socket, 'rateLimited', (data) => data.event === 'reserve');
    for (let i = 0; i < 9; i++) outsiderClient.socket.emit('reserve', { position: 2 });
    await limited;

    playerClient.socket.disconnect();
    await delay(20);

    const reconnectClient = await connectClient();
    sockets.push(reconnectClient.socket);
    const reconnected = waitForEvent(reconnectClient.socket, 'reconnected');
    const restoredState = waitForEvent(reconnectClient.socket, 'state', (state) => state.youId === playerId);
    reconnectClient.socket.emit('reconnectSession', { sessionToken });
    await reconnected;
    const restored = await restoredState;
    assert.equal(restored.players.find((entry) => entry.id === playerId).connected, true);

    outsiderClient.socket.emit('startGame');
    await delay(200);
    assert.equal(restored.gameState, 'LOBBY');

    const started = waitForEvent(reconnectClient.socket, 'state', (state) => state.gameState !== 'LOBBY');
    reconnectClient.socket.emit('startGame');
    assert.notEqual((await started).gameState, 'LOBBY');

    reconnectClient.socket.disconnect();
    await delay(250); // longer than lobby grace; active-match sessions must remain parked
    const lateReconnectClient = await connectClient();
    sockets.push(lateReconnectClient.socket);
    const lateReconnected = waitForEvent(lateReconnectClient.socket, 'reconnected');
    const lateState = waitForEvent(lateReconnectClient.socket, 'state', (state) => state.youId === playerId);
    lateReconnectClient.socket.emit('reconnectSession', { sessionToken });
    await lateReconnected;
    const resumedMatch = await lateState;
    assert.notEqual(resumedMatch.gameState, 'LOBBY');
    assert.equal(resumedMatch.players.find((entry) => entry.id === playerId).connected, true);
  } finally {
    for (const socket of sockets) socket.disconnect();
    server.kill();
  }
});
