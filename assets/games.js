(() => {
  'use strict';

  // The game includes its own multiplayer API. Keep this pointed at that host.
  const GAME_URL = 'https://sorna-overland.darylbwickham.chatgpt.site/';
  const gameUrl = new URL(GAME_URL);
  const room = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
  if (room && /^[A-Z0-9]{6}$/.test(room)) gameUrl.searchParams.set('room', room);

  const frame = document.getElementById('game-frame');
  const cover = document.getElementById('game-cover');
  const stage = document.getElementById('game-stage');
  const fullscreenButton = document.getElementById('fullscreen-game');
  const status = document.getElementById('game-status');

  document.querySelectorAll('.external-game').forEach(link => { link.href = gameUrl.href; });

  // A real expedition screenshot is optional; the contour cover remains usable
  // if the asset is absent during a source-only deployment.
  const previewImage = new Image();
  previewImage.onload = () => cover.classList.add('with-screenshot');
  previewImage.src = new URL('sorna-overland.webp', document.currentScript.src).href;

  document.getElementById('play-game').addEventListener('click', () => {
    status.textContent = room && /^[A-Z0-9]{6}$/.test(room)
      ? `Opening the expedition. Room ${room} is ready in the join form.`
      : 'Loading the expedition…';
    frame.src = gameUrl.href;
    frame.hidden = false;
    cover.hidden = true;
    fullscreenButton.disabled = !stage.requestFullscreen;
    frame.focus();
  }, { once: true });

  frame.addEventListener('load', () => {
    if (!frame.hidden) status.textContent = 'Click inside the game to play. Use the menu to host or join your crew.';
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
      frame.focus();
    } catch {
      status.textContent = 'Fullscreen is unavailable here. Open the game in a new tab for more room.';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.innerHTML = document.fullscreenElement
      ? '<span aria-hidden="true">⛶</span>Exit fullscreen'
      : '<span aria-hidden="true">⛶</span>Fullscreen';
  });
})();
