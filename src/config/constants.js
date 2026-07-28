// Grid + ROW map are single-sourced from server/shared/gameData.json (see
// CLAUDE.md). The JSON lives under server/ so Railway's server-root deploy
// includes it; the client (Netlify base = repo root) reaches it via relative
// import. GAME_WIDTH/GAME_HEIGHT stay derived here.
import gameData from '../../server/shared/gameData.json';

export const TILE_SIZE = gameData.grid.tileSize;
export const COLS = gameData.grid.cols;
export const ROWS = gameData.grid.rows;
export const GAME_WIDTH = COLS * TILE_SIZE;
export const GAME_HEIGHT = ROWS * TILE_SIZE;

export const ROW = gameData.row;
