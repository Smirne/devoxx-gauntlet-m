/**
 * hudTheme.ts — the 3D build's skin for the shared HUD (`src/render/hud.ts`).
 *
 * The HUD's DOM and logic are the diorama's, untouched; this only restyles it
 * in the night-city idiom the 3D look is aiming at: condensed uppercase type,
 * chamfered panels with hairline borders, coral-red chrome with cyan and
 * yellow accents, a faint scanline over the panels. Loaded after the HUD's own
 * stylesheet and scoped under `body.ad3d`, so it wins without `!important`
 * wars and cannot leak into the 2.5D page.
 */

const RED = '#ff5a4e';
const CYAN = '#5ef6ff';
const YELLOW = '#f3e600';

const CSS = `
body.ad3d{background:#000}
body.ad3d .ad-hud{font-family:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",sans-serif;letter-spacing:.02em}
body.ad3d .ad-vig{display:none}
body.ad3d .ad-top{background:linear-gradient(180deg,rgba(6,2,6,.7),rgba(6,2,6,0));border:0;padding:12px 18px 26px;align-items:flex-start}
body.ad3d .ad-brand{order:0}
body.ad3d .ad-chapter{order:1}
body.ad3d .ad-swag{order:2}
body.ad3d .ad-skip{order:6;margin-left:auto}
body.ad3d .ad-obj{order:4;flex:0 0 100%;max-width:min(440px,60vw);margin-left:auto;font-size:12.5px;line-height:1.5;
  padding:8px 12px;background:rgba(10,4,8,.55);border-left:2px solid ${RED}}
body.ad3d .ad-keys{order:5;flex:0 0 100%;text-align:right}
body.ad3d .ad-brand{color:${YELLOW};font-size:14px;letter-spacing:.32em;text-shadow:0 0 12px rgba(243,230,0,.45)}
body.ad3d .ad-chapter{color:${CYAN};text-transform:uppercase;letter-spacing:.14em}
body.ad3d .ad-obj{color:#e9dcd6;font-size:13px}
body.ad3d .ad-obj b{color:${RED}}
body.ad3d .ad-keys{color:#b79c96;text-transform:uppercase;font-size:11px;letter-spacing:.08em}
body.ad3d .ad-skip{background:rgba(255,90,78,.08);color:${RED};border:1px solid ${RED};border-radius:0;
  clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));text-transform:uppercase;letter-spacing:.12em}
body.ad3d .ad-panel,body.ad3d .ad-bot,body.ad3d .ad-cell,body.ad3d .ad-toast,body.ad3d .ad-card .ad-cardbox,body.ad3d .ad-pad .ad-cap{
  border-radius:0;background:linear-gradient(135deg,rgba(24,6,10,.78),rgba(6,10,16,.72));
  border:1px solid rgba(255,90,78,.55);
  clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));
  box-shadow:inset 0 0 0 1px rgba(255,90,78,.08)}
body.ad3d .ad-panel::before,body.ad3d .ad-toast::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)}
body.ad3d .ad-bot{border-color:rgba(255,90,78,.35)}
body.ad3d .ad-bot .ad-name{text-transform:uppercase;letter-spacing:.14em}
body.ad3d .ad-bot.ad-on{transform:none;box-shadow:inset 0 0 18px -6px currentColor}
body.ad3d .ad-speed .ad-v{color:${CYAN};text-shadow:0 0 10px rgba(94,246,255,.5)}
body.ad3d .ad-speed .ad-state,body.ad3d .ad-meter .ad-row{text-transform:uppercase;letter-spacing:.16em}
body.ad3d .ad-track{border-radius:0;background:rgba(255,90,78,.15);height:3px}
body.ad3d .ad-fill{border-radius:0;background:${RED};box-shadow:0 0 8px ${RED}}
body.ad3d .ad-cell{color:${CYAN}}
body.ad3d .ad-cell.ad-typed{color:${YELLOW};border-color:${YELLOW};box-shadow:0 0 16px -3px rgba(243,230,0,.55)}
body.ad3d .ad-toast{border-left:3px solid currentColor}
body.ad3d .ad-bubble{border-radius:0;background:rgba(8,4,8,.84);border:1px solid rgba(94,246,255,.45);
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
body.ad3d .ad-bubble::after{display:none}
body.ad3d .ad-card{background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
/* The run's last card, over the curtain call (keynote3d.ts \`stageView\`): up over the screen, out of the
   way of the three on the stage, and no scrim or blur between the player and the bow. */
body.ad3d .ad-card.ad-card-live{background:rgba(6,7,10,.16);backdrop-filter:none;align-items:flex-start;padding-top:max(64px,9vh)}
body.ad3d .ad-card .ad-cardbox{border-color:${YELLOW};padding:26px 34px}
body.ad3d .ad-card b{color:${YELLOW}}

.ad3d-end{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:radial-gradient(ellipse at center,rgba(40,6,12,.92),rgba(0,0,0,.97));color:#eee;text-align:center;padding:24px;
  font-family:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",sans-serif}
.ad3d-end h1{color:${YELLOW};letter-spacing:.28em;font-size:24px;text-shadow:0 0 18px rgba(243,230,0,.5)}
.ad3d-end button{font:inherit;letter-spacing:.16em;text-transform:uppercase;color:${CYAN};background:transparent;border:1px solid ${CYAN};padding:8px 18px;cursor:pointer}
.ad3d-end button:focus-visible{outline:2px solid ${YELLOW};outline-offset:3px}
.ad3d-lost{background:radial-gradient(ellipse at center,#28060c,#000)}

.ad3d-title{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;justify-content:flex-end;gap:12px;padding:0 max(16px,6vw) 12vh;
  background:linear-gradient(0deg,rgba(0,0,0,.78),rgba(0,0,0,0) 55%);color:#eee;pointer-events:auto;cursor:pointer;
  font-family:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",sans-serif}
.ad3d-title h1{margin:0;color:${YELLOW};font-size:clamp(40px,8vw,96px);letter-spacing:.3em;line-height:1;text-shadow:0 0 28px rgba(243,230,0,.45),3px 0 0 rgba(255,90,78,.6),-3px 0 0 rgba(94,246,255,.45)}
.ad3d-title .ad3d-sub{margin:0;max-width:62ch;font-size:15px;line-height:1.55;color:#d8cfc9}
.ad3d-title .ad3d-poc{margin:0;color:${CYAN};text-transform:uppercase;letter-spacing:.2em;font-size:12px}
.ad3d-title .ad3d-press{margin:0;color:${RED};text-transform:uppercase;letter-spacing:.3em;font-size:13px;animation:ad3d-blink 1.4s steps(2) infinite}
.ad3d-title.ad3d-gate{background:radial-gradient(ellipse at 50% 38%,#1a0f05 0%,#000 70%);justify-content:center;align-items:center;padding:0 16px 14vh;gap:18px;overflow:hidden}
.ad3d-gate>*{position:relative;z-index:1}
.ad3d-gate .ad3d-sparks{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.ad3d-gate .ad3d-city{position:absolute;left:0;bottom:0;z-index:0;pointer-events:none;opacity:.95}
.ad3d-gate .ad3d-mark{max-width:100%;height:auto;filter:drop-shadow(0 0 6px rgba(255,170,60,.9)) drop-shadow(0 0 22px rgba(255,120,20,.55))}
.ad3d-gate h1{font-size:clamp(28px,5vw,56px);color:${YELLOW}}
.ad3d-gate .ad3d-sub{text-align:center;color:#cbb89a;letter-spacing:.12em;text-transform:uppercase;font-size:13px}
@keyframes ad3d-blink{50%{opacity:.25}}
/* The film at the end (keynote3d.ts): the chrome fades out for it; the toasts and the final card stay.
   Important, because the HUD sets the chrome's opacity inline for the cutscene fades. */
body.ad3d.ad3d-film .ad-chrome,body.ad3d.ad3d-film .ad3d-help{opacity:0 !important;transition:opacity .9s ease;pointer-events:none}
@media (prefers-reduced-motion: reduce){.ad3d-title .ad3d-press{animation:none}}
/* Bottom-right, ABOVE the chapter meters (bottom-left is the robot panel):
   and the critic round (29 Sep) found the two printed over each other. */
.ad3d-help{position:fixed;right:16px;bottom:118px;z-index:6;pointer-events:none;color:#b79c96;font:11px/1.6 "Bahnschrift","Arial Narrow",sans-serif;
  text-transform:uppercase;letter-spacing:.14em;text-align:right;opacity:.8;text-shadow:0 1px 3px #000}
/* The task pips and count sit on a dark plate: on a lit carpet they vanished. */
body.ad3d .ad-tasks{background:rgba(8,8,12,.55);border-radius:6px;padding:4px 10px;width:max-content;margin-left:auto;margin-right:auto}
.ad-nohud .ad3d-help{display:none}
/* The quality control, in the top bar beside Skip chapter: in the bar's flow, so
   it can never be printed over another panel. It used to be a button of its own,
   fixed bottom-left, over the speed readout (Michele, 29 Sep: "move the quality
   info somewhere so it's not over other infos"). */
body.ad3d .ad3d-quality{order:6;margin-left:auto;pointer-events:auto;cursor:pointer;white-space:nowrap;
  font:12px system-ui,sans-serif;color:#ffd27a;background:rgba(255,210,122,.06);border:1px solid rgba(255,210,122,.45);
  border-radius:0;padding:4px 10px;text-transform:uppercase;letter-spacing:.12em;
  clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))}
body.ad3d .ad3d-quality + .ad-skip{margin-left:0}
body.ad3d .ad3d-quality:hover{background:rgba(255,210,122,.14)}
body.ad3d .ad3d-quality:focus-visible{outline:2px solid #ffd27a;outline-offset:2px}
body.ad3d .ad3d-quality.ad3d-slow{color:#ff9a4a;border-color:#ff7a1a}
`;

export function installHudTheme(): void {
  document.body.classList.add('ad3d');
  const style = document.createElement('style');
  style.id = 'ad3d-hud-theme';
  style.textContent = CSS;
  // After the HUD's own stylesheet, whenever that lands.
  queueMicrotask(() => document.head.appendChild(style));
  const help = document.createElement('div');
  help.className = 'ad3d-help';
  help.innerHTML = 'mouse · look &nbsp;/&nbsp; click · lock<br>wheel · zoom<br>P · photo mode<br>Q · quality';
  document.body.appendChild(help);
}
