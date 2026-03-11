import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import Slot from "./components/Slot";
import PickerModal from "./components/PickerModal";
import SelectedPanel from "./components/SelectedPanel";

const DEPLOYMENT_ID = import.meta.env.VITE_GAS_DEPLOYMENT_ID;

const SLOT_TO_TYPE = {
  armor:"armor", primary:"주무기", secondary:"보조무기",
  throwable:"투척무기", stratagem:"stratagem",
};
const TYPE_LABEL_KO = {
  armor:"방어구", primary:"주무기", secondary:"보조무기", throwable:"투척무기",
};
const WEAPON_SLOT_KINDS = new Set(["primary","secondary","throwable"]);

const s = (v) => String(v ?? "").trim();
const getSubType              = (it) => s(it?.subType ?? it?.subtype);
const SUBTYPE_BACKPACK_WEAPON = "지원배낭 무기";
const SUBTYPE_BACKPACK        = "배낭";

/* ── localStorage ── */
const LS_KEY = "helldiver_loadouts_v2";
function lsGet()       { try { const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r):null; } catch { return null; } }
function lsSet(data)   { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {} }

/* ── 기본 제공 로드아웃 아이템 ID (실제 DB 기준) ── */
const DEFAULT_LOADOUT_IDS = {
  stratagem: ["st_orb_ps", "st_sw_mg43", null, null],  // 궤도 정밀 타격, MG-43 기관총
  armor:     "ar_ep_b01",    // B-01 전술
  primary:   "pr_ar_ar23",   // AR-23 리버레이터
  secondary: "se_ps_p2",     // P-2 피스메이커
  throwable: "th_gr_g12",    // G-12 고폭
};

function normalizeIcon(it) {
  const id=s(it?.id), raw=s(it?.icon);
  if (raw) return /^https?:\/\//i.test(raw)?raw:raw.startsWith("/")?raw:`/${raw}`;
  if (!id) return "/icons/_default.png";
  return `/icons/${s(it?.sheet||it?.sheetName||it?.type)||"misc"}/${id}.png`;
}
function normalizeItem(it) {
  const type=s(it?.type);
  return { ...it, id:s(it?.id), type, icon:normalizeIcon({...it,type}) };
}

const EMPTY_SELECTED = {
  stratagem:[null,null,null,null],
  armor:null, primary:null, secondary:null, throwable:null,
};



/* ── PNG 출력: Canvas API 직접 구현 ──
   html2canvas 대신 selected 데이터를 직접 canvas에 렌더링
   이미지는 fetch → blob → createObjectURL 로 cross-origin 우회
*/
const PEN_LABEL_PNG = { "2":"경장갑 관통","3":"일반 장갑 관통","4":"중장갑 관통","5":"대전차1","6":"대전차2","7":"대전차3","8":"대전차4","9":"대전차5","10":"대전차6" };
const PEN_BG_PNG    = { "2":"#565656","3":"#cd8527","4":"#cd8527","5":"#8a080d","6":"#8a080d","7":"#6b0c0f","8":"#6b0c0f","9":"#1a1a1a","10":"#1a1a1a" };
const TRAIT_BG_PNG  = {
  "소이":"#ffcfc9","폭발성":"#ffc8aa","레이저":"#ffe5a0","플라즈마":"#e6cff2",
  "아크":"#0a53a8","가스":"#d4edbc","기절":"#d4edbc","치유":"#d4edbc",
  /* 흰색 배경 태그 */
  "한 손 파지":"#e8e8e8","단발 장전":"#e8e8e8","탄종/발사형식 변경":"#e8e8e8",
  "차지 업":"#e8e8e8","과열":"#e8e8e8","총검":"#e8e8e8","소음기":"#e8e8e8",
};
const TRAIT_TC_PNG  = {
  "아크":"#fff",
  /* 흰색 배경 → 어두운 텍스트 */
  "한 손 파지":"#1a1a1a","단발 장전":"#1a1a1a","탄종/발사형식 변경":"#1a1a1a",
  "차지 업":"#1a1a1a","과열":"#1a1a1a","총검":"#1a1a1a","소음기":"#1a1a1a",
};

/* URL의 확장자를 교체해 fallback 목록 생성 */
function buildFallbackUrls(url) {
  if (!url) return [];
  const base = window.location.origin;
  const abs  = url.startsWith("http") ? url : base + (url.startsWith("/") ? url : "/" + url);
  const noExt = abs.replace(/\.(png|svg|webp)$/i, "");
  // png → svg → webp 순
  return [abs, noExt + ".svg", noExt + ".webp", noExt + ".png"].filter((v,i,a)=>a.indexOf(v)===i);
}

/* 이미지를 순차적으로 시도 → 성공한 첫 번째 반환 */
async function loadImgWithFallback(url) {
  if (!url) return null;
  const urls = buildFallbackUrls(url);
  for (const u of urls) {
    const img = await new Promise(res => {
      const el = new Image();
      // SVG는 crossOrigin 없이 시도 (tainting 허용)
      if (!/\.svg$/i.test(u)) el.crossOrigin = "anonymous";
      el.onload  = () => res(el);
      el.onerror = () => res(null);
      el.src = u;
    });
    if (img && (img.naturalWidth > 0 || img.width > 0)) return img;
    // SVG는 naturalWidth=0 이어도 실제로는 로드 성공인 경우 있음
    if (img && /\.svg$/i.test(u)) return img;
  }
  return null;
}

function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

async function exportLoadoutPng(captureRef, selected) {
  const SC=2;
  const FONT="'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";
  const PAD=20, GAP=12;

  /* ── 좌측 로드아웃 영역 치수 ── */
  const STRAT_SZ=140;
  /* 수정2: 개인장비 전체 폭 = 스트라타젬 4개와 동일하게 */
  const STRAT_ROW_W = STRAT_SZ*4 + GAP*3;   // 스트라타젬 행 총 폭
  /* 개인장비 폭 배분: armor(1) : primary(2) : side(1) = 1:2:1 비율 */
  const ARM_W  = Math.floor((STRAT_ROW_W - GAP*2) / 4);       // 1칸
  const PRI_W  = ARM_W*2 + GAP;                                // 2칸
  const SIDE_W = STRAT_ROW_W - ARM_W - GAP - PRI_W - GAP;     // 나머지
  const ARM_H  = 290;
  const PRI_H  = Math.floor(ARM_H * 0.62);
  const SIDE_H = (ARM_H - GAP) / 2;
  const LEFT_W = STRAT_ROW_W;

  /* ── 우측 현재선택 패널 치수 ── */
  const SEL_W=240;
  const TOTAL_W=PAD+LEFT_W+GAP+SEL_W+PAD;

  /* ── 높이 계산 ── */
  const TITLE_H=18, SEC_GAP=20;
  // 로드아웃 행들
  const STRAT_BLOCK = TITLE_H+6+STRAT_SZ;
  const GEAR_BLOCK  = TITLE_H+6+ARM_H;
  const LEFT_H = STRAT_BLOCK + SEC_GAP + GEAR_BLOCK;

  // 현재선택 패널 높이 — pill 줄넘김 최대 2줄 기준으로 넉넉히 잡음
  const SEL_ROW_H=36;
  const SEL_H = 24 + 4 + (4*(SEL_ROW_H+8)) + 14 + 14 + 4 + (4*(SEL_ROW_H+16));

  const TOTAL_H = PAD + Math.max(LEFT_H, SEL_H) + PAD;

  const canvas = document.createElement("canvas");
  canvas.width  = TOTAL_W * SC;
  canvas.height = TOTAL_H * SC;
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.scale(SC, SC);

  // 배경: 짙은 회색
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);

  /* ── 모든 이미지 병렬 로드 ── */
  const [stratImgs, armImg, priImg, secImg, thrImg] = await Promise.all([
    Promise.all(selected.stratagem.map(it => loadImgWithFallback(it?.icon))),
    loadImgWithFallback(selected.armor?.icon),
    loadImgWithFallback(selected.primary?.icon),
    loadImgWithFallback(selected.secondary?.icon),
    loadImgWithFallback(selected.throwable?.icon),
  ]);

  /* ── 드로잉 헬퍼 ── */
  function secTitle(text, x, y) {
    ctx.fillStyle="#f0c400"; ctx.font=`800 13px ${FONT}`;
    ctx.textBaseline="middle"; ctx.textAlign="left";
    ctx.fillText(text, x, y+7);
  }

  function slotBox(x, y, w, h, hasPick, r=13) {
    ctx.fillStyle="rgba(18,18,18,0.88)"; rRect(ctx,x,y,w,h,r); ctx.fill();
    ctx.strokeStyle=hasPick?"rgba(255,210,0,0.85)":"rgba(255,255,255,0.22)";
    ctx.lineWidth=hasPick?2:1; rRect(ctx,x,y,w,h,r); ctx.stroke();
  }

  function drawContain(img, x, y, w, h, pad=8) {
    if (!img) return;
    const iw=img.naturalWidth||w, ih=img.naturalHeight||h;
    const sc=Math.min((w-pad*2)/iw,(h-pad*2)/ih);
    const dw=iw*sc, dh=ih*sc;
    ctx.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
  }

  function drawCover(img, x, y, w, h) {
    if (!img) return;
    const iw=img.naturalWidth||w, ih=img.naturalHeight||h;
    const sc=Math.max(w/iw, h/ih);
    const dw=iw*sc, dh=ih*sc;
    ctx.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
  }

  /* pillTag — 수정4: 밝은 배경(밝기>0.55)일 때 텍스트 강제 어둡게, 어두운 배경엔 밝게 */
  function pillTag(text, x, y, bg, tc) {
    ctx.font=`800 10px ${FONT}`; ctx.textBaseline="middle";
    const tw=ctx.measureText(text).width, pw=tw+14, ph=17;
    ctx.fillStyle=bg||"rgba(255,255,255,0.10)";
    rRect(ctx,x,y-ph/2,pw,ph,9); ctx.fill();
    /* 명도 판별: rgba/hex 파싱 없이 tc가 없으면 배경에 따라 자동 결정 */
    let finalTc = tc;
    if (!finalTc) {
      const isLight = bg && (bg.startsWith("#ff")||bg.startsWith("#fe")||bg.startsWith("#fd")||
                             bg.startsWith("#e8")||bg.startsWith("#e6")||bg.startsWith("#d4")||
                             /rgba?\(2[0-9]{2}/.test(bg));
      finalTc = isLight ? "#1a1a1a" : "#fff";
    }
    ctx.fillStyle=finalTc; ctx.textAlign="left";
    ctx.fillText(text,x+7,y);
    return pw+5;
  }

  /* maxW 안에 들어오도록 말줄임 처리 후 fillText */
  function ellipsisText(text, x, y, maxW) {
    if (!text) return;
    if (ctx.measureText(text).width <= maxW) { ctx.fillText(text, x, y); return; }
    const ellipsis = "…";
    const ew = ctx.measureText(ellipsis).width;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid)).width + ew <= maxW) lo = mid; else hi = mid - 1;
    }
    ctx.fillText(text.slice(0, lo) + ellipsis, x, y);
  }

  /* ══════════════════════════════════════════
     좌측: 스트라타젬 + 개인장비
  ══════════════════════════════════════════ */
  let cy=PAD;
  const LX=PAD;

  /* 1. 스트라타젬 */
  secTitle("스트라타젬", LX, cy); cy+=TITLE_H+6;

  for (let i=0; i<4; i++) {
    const it=selected.stratagem[i];
    const sx=LX+i*(STRAT_SZ+GAP), sy=cy;
    slotBox(sx,sy,STRAT_SZ,STRAT_SZ,!!it);
    if (it && stratImgs[i]) {
      ctx.save();
      rRect(ctx,sx+2,sy+2,STRAT_SZ-4,STRAT_SZ-4,11); ctx.clip();
      drawContain(stratImgs[i],sx+2,sy+2,STRAT_SZ-4,STRAT_SZ-4,8);
      ctx.restore();
    } else if (!it) {
      ctx.fillStyle="rgba(255,255,255,0.28)"; ctx.font=`700 11px ${FONT}`;
      ctx.textBaseline="middle"; ctx.textAlign="center";
      ctx.fillText("미선택",sx+STRAT_SZ/2,sy+STRAT_SZ/2); ctx.textAlign="left";
    }
  }
  cy+=STRAT_SZ+SEC_GAP;

  /* 2. 개인 장비 */
  secTitle("개인 장비", LX, cy); cy+=TITLE_H+6;
  const gearY=cy;

  // 방어구 (cover)
  const AX=LX, AY=gearY;
  slotBox(AX,AY,ARM_W,ARM_H,!!selected.armor);
  if (selected.armor && armImg) {
    /* 수정6: clip을 stroke 이후 별도 save로 적용 → 이미지가 테두리 바깥으로 나가지 않음 */
    ctx.save();
    rRect(ctx,AX+1,AY+1,ARM_W-2,ARM_H-2,12); ctx.clip();
    drawCover(armImg,AX,AY,ARM_W,ARM_H);
    const grad=ctx.createLinearGradient(0,AY+ARM_H-80,0,AY+ARM_H);
    grad.addColorStop(0,"rgba(0,0,0,0)"); grad.addColorStop(1,"rgba(0,0,0,0.92)");
    ctx.fillStyle=grad; ctx.fillRect(AX,AY+ARM_H-80,ARM_W,80);
    ctx.restore();
    if (selected.armor.passive) {
      ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.font=`700 9px ${FONT}`;
      ctx.textBaseline="bottom"; ctx.textAlign="left";
      ctx.fillText(selected.armor.passive,AX+10,AY+ARM_H-28);
    }
    ctx.fillStyle="#fff"; ctx.font=`900 16px ${FONT}`; ctx.textBaseline="bottom"; ctx.textAlign="left";
    ellipsisText(selected.armor.name_ko||"", AX+10, AY+ARM_H-10, ARM_W-20);
  } else if (!selected.armor) {
    ctx.fillStyle="rgba(255,255,255,0.22)"; ctx.font=`700 11px ${FONT}`;
    ctx.textBaseline="middle"; ctx.textAlign="center";
    ctx.fillText("미선택",AX+ARM_W/2,AY+ARM_H/2); ctx.textAlign="left";
  }

  // 주무기 (contain)
  const PX=LX+ARM_W+GAP, PY=gearY;
  slotBox(PX,PY,PRI_W,PRI_H,!!selected.primary);
  if (selected.primary && priImg) {
    ctx.save(); rRect(ctx,PX+2,PY+2,PRI_W-4,PRI_H-4,11); ctx.clip();
    drawContain(priImg,PX+2,PY+2,PRI_W-4,PRI_H-4,12);
    ctx.restore();
  }
  if (!selected.primary) {
    ctx.fillStyle="rgba(255,255,255,0.22)"; ctx.font=`700 11px ${FONT}`;
    ctx.textBaseline="middle"; ctx.textAlign="center";
    ctx.fillText("미선택",PX+PRI_W/2,PY+PRI_H/2); ctx.textAlign="left";
  } else {
    const infoY=PY+PRI_H+10;
    /* 수정3: 첫 번째 pill = weaponType (무기 소분류), 이후 특성 태그 */
    const weaponType=String(selected.primary.weaponType??"");
    let tx=PX;
    if (weaponType) tx+=pillTag(weaponType,tx,infoY+9,"rgba(255,255,255,0.10)","rgba(255,255,255,0.85)");
    for (const t of [selected.primary.trait1,selected.primary.trait2,selected.primary.trait3].filter(Boolean))
      tx+=pillTag(String(t),tx,infoY+9,TRAIT_BG_PNG[t]||"rgba(255,255,255,0.1)",TRAIT_TC_PNG[t]||null);
    ctx.fillStyle="#fff"; ctx.font=`900 20px ${FONT}`; ctx.textBaseline="top"; ctx.textAlign="left";
    ellipsisText(selected.primary.name_ko||"", PX, infoY+22, PRI_W-10);
    if (selected.primary.desc) {
      ctx.fillStyle="rgba(255,255,255,0.55)"; ctx.font=`11px ${FONT}`;
      ctx.fillText(String(selected.primary.desc).slice(0,46),PX,infoY+46);
    }
  }

  // 보조/투척 (contain — 정사각 스택) ← 버그 수정: key/idx 혼용 제거
  const SX=PX+PRI_W+GAP;
  const sideSlots = [
    { key:"secondary", img:secImg, label:"보조무기", offsetY:0 },
    { key:"throwable",  img:thrImg, label:"투척무기",  offsetY:SIDE_H+GAP },
  ];
  for (const slot of sideSlots) {
    const it=selected[slot.key];
    const sy2=gearY+slot.offsetY;
    slotBox(SX,sy2,SIDE_W,SIDE_H,!!it);
    if (it && slot.img) {
      ctx.save(); rRect(ctx,SX+2,sy2+2,SIDE_W-4,SIDE_H-4,11); ctx.clip();
      drawContain(slot.img,SX+2,sy2+2,SIDE_W-4,SIDE_H-4,10);
      ctx.restore();
    } else if (!it) {
      ctx.fillStyle="rgba(255,255,255,0.22)"; ctx.font=`700 10px ${FONT}`;
      ctx.textBaseline="middle"; ctx.textAlign="center";
      ctx.fillText("미선택",SX+SIDE_W/2,sy2+SIDE_H/2); ctx.textAlign="left";
    }
  }

  /* ══════════════════════════════════════════
     우측: 현재 선택 패널
  ══════════════════════════════════════════ */
  const RX=PAD+LEFT_W+GAP;
  const RY=PAD;

  // 패널 배경
  ctx.fillStyle="rgba(22,22,22,0.95)";
  rRect(ctx,RX,RY,SEL_W,TOTAL_H-PAD*2,14); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.08)"; ctx.lineWidth=1;
  rRect(ctx,RX,RY,SEL_W,TOTAL_H-PAD*2,14); ctx.stroke();

  let ry=RY+16;
  const RP=14; // 패널 내부 패딩

  // 타이틀
  ctx.fillStyle="#f0c400"; ctx.font=`900 14px ${FONT}`; ctx.textBaseline="middle"; ctx.textAlign="left";
  ctx.fillText("현재 선택",RX+RP,ry+7); ry+=22;

  // 구분선
  ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(RX+RP,ry,SEL_W-RP*2,1); ry+=10;

  // 섹션 레이블
  function selLabel(text, y2) {
    ctx.fillStyle="rgba(255,255,255,0.38)"; ctx.font=`900 10px ${FONT}`;
    ctx.textBaseline="middle"; ctx.textAlign="left";
    ctx.fillText(text,RX+RP,y2);
  }
  function selRow(numTxt, name, desc, y2) {
    ctx.fillStyle="rgba(255,255,255,0.38)"; ctx.font=`900 11px ${FONT}`;
    ctx.textBaseline="top"; ctx.textAlign="left";
    ctx.fillText(numTxt,RX+RP,y2);
    ctx.fillStyle=name?"#fff":"rgba(255,255,255,0.28)"; ctx.font=`900 11px ${FONT}`;
    ctx.textAlign="left";
    ellipsisText(name||"미선택", RX+RP+28, y2, SEL_W-RP*2-28);
    if (desc) {
      ctx.fillStyle="rgba(255,255,255,0.45)"; ctx.font=`10px ${FONT}`;
      ellipsisText(String(desc), RX+RP+28, y2+14, SEL_W-RP*2-28);
    }
  }

  selLabel("스트라타젬", ry); ry+=16;
  for (let i=0;i<4;i++) {
    const it=selected.stratagem[i];
    selRow(`#${i+1}`, it?.name_ko||null, it?.desc||null, ry);
    ry+=it?.desc?30:18;
  }

  ry+=6;
  ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(RX+RP,ry,SEL_W-RP*2,1); ry+=10;
  selLabel("개인 장비", ry); ry+=16;

  const gearRowDefs=[
    {lbl:"방어구",key:"armor"},
    {lbl:"주무기",key:"primary"},
    {lbl:"보조무기",key:"secondary"},
    {lbl:"투척무기",key:"throwable"},
  ];
  for (const {lbl,key} of gearRowDefs) {
    const it=selected[key];
    // 레이블
    ctx.fillStyle="rgba(255,255,255,0.40)"; ctx.font=`900 10px ${FONT}`;
    ctx.textBaseline="top"; ctx.textAlign="left";
    ctx.fillText(lbl,RX+RP,ry);
    // 이름
    ctx.fillStyle=it?"#fff":"rgba(255,255,255,0.28)"; ctx.font=`900 11px ${FONT}`;
    ctx.textAlign="left";
    ellipsisText(it?.name_ko||"미선택", RX+RP+44, ry, SEL_W-RP*2-44);
    ry+=14;
    // 뱃지 (방어구: armorValue+passive, 무기: pen+trait) — 줄넘김 지원
    if (it) {
      const PILL_X0 = RX+RP+44;
      const PILL_MAXW = SEL_W-RP*2-44;   // 패널 내 pill 허용 폭
      let bx = PILL_X0;
      let pillRowUsed = false;

      /* pill 하나를 그리되, 폭 초과 시 줄바꿈 */
      function pillWrap(text, bg, tc) {
        ctx.font=`800 10px ${FONT}`;
        const tw = ctx.measureText(text).width;
        const pw = tw + 14;
        if (pillRowUsed && bx + pw > PILL_X0 + PILL_MAXW) {
          bx = PILL_X0;
          ry += 22;
        }
        pillTag(text, bx, ry+8, bg, tc);
        bx += pw + 5;
        pillRowUsed = true;
      }

      if (key==="armor") {
        if (it.armorValue) pillWrap(String(it.armorValue),"rgba(255,255,255,0.10)","rgba(255,255,255,0.85)");
        if (it.passive)    pillWrap(String(it.passive),"rgba(240,196,0,0.15)","#f0c400");
      } else {
        const pk=String(it.armorPen??"");
        if (PEN_LABEL_PNG[pk]) pillWrap(PEN_LABEL_PNG[pk],PEN_BG_PNG[pk]||"#555","#fff");
        for (const t of [it.trait1,it.trait2,it.trait3].filter(Boolean))
          pillWrap(String(t),TRAIT_BG_PNG[t]||"rgba(255,255,255,0.1)",TRAIT_TC_PNG[t]||null);
      }
      if (pillRowUsed) ry+=22; else ry+=6;
    } else {
      ry+=6;
    }
  }

  /* 워터마크 — 수정5: 노란색, 날짜 제거 */
  ctx.fillStyle="#f0c400"; ctx.font=`700 10px ${FONT}`;
  ctx.textBaseline="bottom"; ctx.textAlign="right";
  ctx.fillText("SES 자기 결정의 전달자",TOTAL_W-PAD,TOTAL_H-6);

  const link=document.createElement("a");
  link.download=`loadout_${Date.now()}.png`;
  link.href=canvas.toDataURL("image/png");
  link.click();
}

/* ── FireformRow: 화력 투사 형태 한 행 ── */
function getFireformBadgeStyle(f) {
  if (!f) return {};
  if (f.startsWith("단일 | 범위형") || f.startsWith("범위형"))
    return { background:"rgba(251,146,60,.12)", borderColor:"rgba(251,146,60,.45)",  color:"#fb923c" };
  if (f==="탄막형" || f==="단일 | 탄막형")
    return { background:"rgba(250,204,21,.10)",  borderColor:"rgba(250,204,21,.40)",  color:"#fde047" };
  if (f==="단일 정밀")     return { background:"rgba(96,165,250,.10)",  borderColor:"rgba(96,165,250,.40)",  color:"#60a5fa" };
  if (f==="범위 CC")       return { background:"rgba(167,139,250,.12)", borderColor:"rgba(167,139,250,.45)", color:"#a78bfa" };
  if (f==="대상 저지")     return { background:"rgba(52,211,153,.10)",  borderColor:"rgba(52,211,153,.40)",  color:"#34d399" };
  if (f==="근접")          return { background:"rgba(248,113,113,.10)", borderColor:"rgba(248,113,113,.40)", color:"#f87171" };
  if (f==="위치 은폐")     return { background:"rgba(129,140,248,.10)", borderColor:"rgba(129,140,248,.40)", color:"#818cf8" };
  if (f==="전투 보조")     return { background:"rgba(52,211,153,.10)",  borderColor:"rgba(52,211,153,.40)",  color:"#34d399" };
  if (f==="단일 개체")     return { background:"rgba(96,165,250,.10)",  borderColor:"rgba(96,165,250,.40)",  color:"#60a5fa" };
  if (f==="탄막 | 대전차") return { background:"rgba(239,68,68,.12)",   borderColor:"rgba(239,68,68,.45)",   color:"#ef4444" };
  if (f==="범용 대전차")   return { background:"rgba(239,68,68,.12)",   borderColor:"rgba(239,68,68,.45)",   color:"#ef4444" };
  if (f==="적 유인")       return { background:"rgba(250,204,21,.10)",  borderColor:"rgba(250,204,21,.40)",  color:"#fde047" };
  if (f==="방어막")        return { background:"rgba(56,189,248,.10)",  borderColor:"rgba(56,189,248,.40)",  color:"#38bdf8" };
  if (f==="전방 방어")     return { background:"rgba(99,102,241,.10)",  borderColor:"rgba(99,102,241,.40)",  color:"#818cf8" };
  if (f==="기동력, 지형 활용") return { background:"rgba(52,211,153,.08)", borderColor:"rgba(52,211,153,.35)", color:"#6ee7b7" };
  if (f==="부분적 중형 적 대응") return { background:"rgba(255,163,43,.10)", borderColor:"rgba(255,163,43,.40)", color:"#ffa32b" };
  if (f==="전진형 화력투사")   return { background:"rgba(251,146,60,.10)", borderColor:"rgba(251,146,60,.40)", color:"#fdba74" };
  if (f==="횡방향 화력투사")   return { background:"rgba(167,139,250,.10)",borderColor:"rgba(167,139,250,.40)",color:"#c4b5fd" };
  if (f==="구역 화력투사")     return { background:"rgba(239,68,68,.10)",  borderColor:"rgba(239,68,68,.40)",  color:"#fca5a5" };
  return { background:"rgba(148,163,184,.08)", borderColor:"rgba(148,163,184,.25)", color:"rgba(203,213,225,.85)" };
}
/* ── 전쟁 채권 배지 스타일 ── */
/* ── 전쟁 채권 표시 순서 (armor 시트 G열 기준 — 파일 업로드 후 갱신 필요) ── */
const WB_ORDER = [
  "헬다이버 출동!","결연한 베테랑","최첨단","민주적 폭파","극지의 애국자",
  "독사 특공대","자유의 불꽃","화학 요원","진리의 집행자","도시 전설",
  "자유의 종복","정의의 경계선","의장의 달인","법의 위력","대조군",
  "먼지 폭풍","금사 특공대","존재하지 않는 부대","공성 파괴자",
  "민주적 궤도 강하 타격대","정의로운 망령",
];
function sortByWbOrder(entries) {
  return [...entries].sort(([a],[b]) => {
    const ai = WB_ORDER.indexOf(a), bi = WB_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

const WB_STYLES = {
  "헬다이버 출동!":        { color:"#f7f352", background:"#0e2c2e", borderColor:"rgba(247,243,82,.35)" },
  "결연한 베테랑":         { color:"#ffffff", background:"#ea630f", borderColor:"rgba(255,255,255,.3)" },
  "최첨단":                { color:"#60d8ff", background:"#0044ab", borderColor:"rgba(96,216,255,.50)", textShadow:"0 0 10px #40efff" },
  "민주적 폭파":           { color:"#ef8f00", background:"#920f00", borderColor:"rgba(239,143,0,.35)"  },
  "극지의 애국자":         { color:"#ffffff", background:"#3eb0e8", borderColor:"rgba(255,255,255,.3)" },
  "독사 특공대":           { color:"#ffffff", background:"#103318", borderColor:"rgba(255,255,255,.2)" },
  "자유의 불꽃":           { color:"#ff7918", background:"#562f18", borderColor:"rgba(255,121,24,.35)" },
  "화학 요원":             { color:"#d3ec18", background:"#3c4209", borderColor:"rgba(211,236,24,.3)"  },
  "진리의 집행자":         { color:"#b50000", background:"#ceb7b7", borderColor:"rgba(181,0,0,.4)"     },
  "도시 전설":             { color:"#ceae00", background:"#3c4548", borderColor:"rgba(206,174,0,.35)"  },
  "자유의 종복":           { color:"#ffffff", background:"#180000", borderColor:"rgba(255,255,255,.2)" },
  "정의의 경계선":         { color:"#dddadd", background:"#422d21", borderColor:"rgba(221,218,221,.25)"},
  "의장의 달인":           { color:"#105994", background:"#ffffff", borderColor:"#efdf94"              },
  "법의 위력":             { color:"#ffffff", background:"#1e1831", borderColor:"#d64566"              },
  "대조군":               { color:"#15354e", background:"#d4d2d1", borderColor:"rgba(21,53,78,.3)"    },
  "먼지 폭풍":             { color:"#efd7a8", background:"#301807", borderColor:"rgba(239,215,168,.3)" },
  "금사 특공대":           { color:"#bae0b2", background:"#1b1b0b", borderColor:"rgba(186,224,178,.3)" },
  "존재하지 않는 부대":    { color:"#fb8080", background:"#08191c", borderColor:"rgba(251,128,128,.35)", textShadow:"0 0 8px #410913" },
  "공성 파괴자":           { color:"#f1d460", background:"#2a292a", borderColor:"rgba(241,212,96,.35)", textShadow:"0 0 8px #a44c21" },
  "민주적 궤도 강하 타격대":{ color:"#ffffff", background:"#081c28", borderColor:"#fbfbaa"              },
  "정의로운 망령":         { color:"#ffffff", background:"#1e1d1b", borderColor:"#fbee6b"              },
  "슈퍼시민권 업그레이드":  { color:"#fee800", background:"#000000", borderColor:"#fee800"              },
  "슈퍼스토어 구매":        { color:"#00f6ff", background:"#001c2e", borderColor:"rgba(0,246,255,.65)", textShadow:"0 0 8px rgba(0,246,255,.5)" },
};
function getWbBadgeStyle(wb) {
  return WB_STYLES[wb] ?? { color:"rgba(255,255,255,.8)", background:"rgba(255,255,255,.07)", borderColor:"rgba(255,255,255,.18)" };
}

/* ── Ergo 배지 스타일 ── */
function getErgoBadgeStyle(ergo) {
  if (ergo === "높음") return { background:"rgba(134,239,172,.12)", borderColor:"rgba(134,239,172,.40)", color:"#86efac" };
  if (ergo === "보통") return { background:"rgba(250,204,21,.10)",  borderColor:"rgba(250,204,21,.38)",  color:"#fde047" };
  if (ergo === "낮음") return { background:"rgba(223,63,63,.12)",   borderColor:"rgba(223,63,63,.40)",   color:"#df3f3f" };
  if (ergo === "투척") return { background:"rgba(255,255,255,.08)", borderColor:"rgba(255,255,255,.30)", color:"#ffffff" };
  return null;
}


/* ─────────────────────────────────────────────
   튜토리얼 오버레이
   ───────────────────────────────────────────── */
const TUTORIAL_STEPS = [
  {
    title: null, // 인트로 — 강조 없음, 중앙 표시
    desc:  "반갑다! 헬다이버 제군.\n나는 브라쉬 장군이다, 헬다이버에게 끝없는 기개만큼이나 중요한 것은 자신만의 장비를 구성하는 것이다!",
    area:  null,
    image: "/brash.png",
  },
  {
    title: "스트라타젬 선택 영역",
    desc:  "이곳은 자네가 임무를 진행하는 동안 사용할 스트라타젬을 구성할 수 있다! 다양한 상황에 대응할 수 있는 조합을 구성해라!",
    area:  "stratRow",
  },
  {
    title: "개인 장비 슬롯",
    desc:  "이곳에서 자네가 투입되자마자 사용할 장비를 선택 가능하다! 스트라타젬 구성에 따라 부족한 점을 보완할 수 있게 하도록!",
    area:  "gearLayout",
  },
  {
    title: "현재 선택 패널",
    desc:  "이곳에서 현재 자신이 선택한 장비와 스트라타젬을 확인 가능하다. 장비 구성에 부족한 부분이 없는지 다시 한번 확인하도록!\n태그 위에 커서를 올리면 태그의 설명을 보는 것이 가능하다. 참고해라!",
    area:  "selectedPanel",
  },
  {
    title: "역할 분류",
    desc:  "자네의 장비 구성에 따라 적합한 역할을 이곳에 표시한다. 팀에게 어떠한 방식으로 기여할 수 있는지 확인하도록!",
    area:  "roleTagsSection",
  },
  {
    title: "로드아웃 분석",
    desc:  "자네가 선택한 장비들이 어떤 식으로 상호작용 하는지 이곳에서 확인 가능하다. 부족한 부분은 어떻게 보완할지 항상 고민해라!",
    area:  "synergySectionItem",
  },
  {
    title: "구성 요구 사항",
    desc:  "이곳에서 구성하고자 하는 장비 구성을 위해 필요한 전쟁 채권을 확인 가능하다! 계획을 철저히 하는것 또한 헬다이버의 소양이지!",
    area:  "reqSection",
  },
  {
    title: "로드아웃 관리 기능",
    desc:  "이곳에서 자네가 구성한 장비 구성을 저장하고 불러올 수 있다! 제군의 민주주의를 전파하는 방식을 동료 헬다이버에게 공유하고 싶다면 이미지로 내보내는 것도 가능하다!",
    area:  "loadoutMgmtBtns",
  },
  {
    title: null, // 아웃트로 — 강조 없음, 중앙 표시
    desc:  "설명은 여기까지다. 제군만의 방법으로 민주주의를 은하계 전체에 전파하도록!\n브라쉬 장군, 통신 종료!",
    area:  null,
    image: "/brash.png",
  },
];

function TutorialOverlay({ step, onNext, onPrev, onClose }) {
  const [rect, setRect] = useState(null);
  const PAD = 10;

  useEffect(() => {
    if (step < 0 || step >= TUTORIAL_STEPS.length) { setRect(null); return; }
    const area = TUTORIAL_STEPS[step].area;
    if (!area) { setRect(null); return; } // 인트로/아웃트로: 강조 없음
    const el = document.querySelector(`.${area}`);
    if (!el) { setRect(null); return; }

    const calcRect = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD*2, height: r.height + PAD*2 });
    };

    el.scrollIntoView({ behavior:"smooth", block:"center" });
    const t1 = setTimeout(calcRect, 100);
    const t2 = setTimeout(calcRect, 420);
    const t3 = setTimeout(calcRect, 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [step]);

  if (step < 0 || step >= TUTORIAL_STEPS.length) return null;
  const { title, desc, image } = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isCenterMode = !TUTORIAL_STEPS[step].area; // 인트로/아웃트로

  const W = window.innerWidth, H = window.innerHeight;
  const CARD_W = 460, CARD_H = image ? 340 : 260, MARGIN = 14;

  const clipPath = rect
    ? `polygon(0 0, ${W}px 0, ${W}px ${H}px, 0 ${H}px, 0 0, ${rect.left}px ${rect.top}px, ${rect.left}px ${rect.top+rect.height}px, ${rect.left+rect.width}px ${rect.top+rect.height}px, ${rect.left+rect.width}px ${rect.top}px, ${rect.left}px ${rect.top}px)`
    : "none";

  let cardTop, cardLeft;
  if (rect) {
    const spaceBelow = H - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const spaceRight = W - (rect.left + rect.width);
    const spaceLeft  = rect.left;
    if (spaceBelow >= CARD_H + MARGIN) {
      cardTop  = rect.top + rect.height + MARGIN;
      cardLeft = Math.max(MARGIN, Math.min(rect.left, W - CARD_W - MARGIN));
    } else if (spaceAbove >= CARD_H + MARGIN) {
      cardTop  = rect.top - CARD_H - MARGIN;
      cardLeft = Math.max(MARGIN, Math.min(rect.left, W - CARD_W - MARGIN));
    } else if (spaceRight >= CARD_W + MARGIN) {
      cardLeft = rect.left + rect.width + MARGIN;
      cardTop  = Math.max(MARGIN, Math.min(rect.top, H - CARD_H - MARGIN));
    } else if (spaceLeft >= CARD_W + MARGIN) {
      cardLeft = rect.left - CARD_W - MARGIN;
      cardTop  = Math.max(MARGIN, Math.min(rect.top, H - CARD_H - MARGIN));
    } else {
      cardTop  = H - CARD_H - MARGIN * 2;
      cardLeft = Math.max(MARGIN, (W - CARD_W) / 2);
    }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:2000, pointerEvents:"none" }}>
      {/* 어두운 배경 */}
      <div style={{
        position:"absolute", inset:0, background:"rgba(0,0,0,.72)",
        clipPath: rect ? clipPath : undefined,
        transition:"clip-path 0.45s cubic-bezier(.4,0,.2,1)",
        pointerEvents:"auto",
      }} onClick={onClose} />

      {/* 하이라이트 테두리 글로우 */}
      {rect && (
        <div style={{
          position:"fixed",
          top:rect.top, left:rect.left,
          width:rect.width, height:rect.height,
          borderRadius:12,
          border:"2px solid rgba(253,224,71,.9)",
          boxShadow:"0 0 0 4px rgba(253,224,71,.15), 0 0 24px rgba(253,224,71,.5), inset 0 0 16px rgba(253,224,71,.08)",
          animation:"tutGlow 1.6s ease-in-out infinite",
          transition:"top 0.45s cubic-bezier(.4,0,.2,1), left 0.45s cubic-bezier(.4,0,.2,1), width 0.45s cubic-bezier(.4,0,.2,1), height 0.45s cubic-bezier(.4,0,.2,1)",
          pointerEvents:"none",
        }} />
      )}

      {/* 카드 */}
      <div onClick={e=>e.stopPropagation()} style={{
        position:"fixed",
        top:  isCenterMode ? "50%" : (rect ? cardTop  : "50%"),
        left: isCenterMode ? "50%" : (rect ? cardLeft : "50%"),
        transform: (isCenterMode || !rect) ? "translate(-50%,-50%)" : "none",
        transition:"top 0.45s cubic-bezier(.4,0,.2,1), left 0.45s cubic-bezier(.4,0,.2,1)",
        zIndex:2001, pointerEvents:"auto",
        background:"#1a1a1a",
        border:"1px solid rgba(253,224,71,.30)",
        boxShadow:"0 0 32px rgba(253,224,71,.18), 0 8px 40px rgba(0,0,0,.7)",
        borderRadius:16, padding:"26px 30px",
        width:460, maxWidth:"calc(100vw - 24px)",
        display:"flex", flexDirection:"column", gap:16,
      }}>
        {/* 진행 바 */}
        <div style={{ display:"flex", gap:5 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{
              height:3, flex:1, borderRadius:99,
              background: i <= step ? "#fde047" : "rgba(255,255,255,.15)",
              boxShadow: i === step ? "0 0 6px rgba(253,224,71,.7)" : "none",
              transition:"background .25s, box-shadow .25s",
            }} />
          ))}
        </div>
        {/* 단계 */}
        <div style={{ fontSize:11, fontWeight:700, color:"rgba(253,224,71,.65)", letterSpacing:".1em" }}>
          STEP {step + 1} / {TUTORIAL_STEPS.length}
        </div>

        {/* 인트로/아웃트로: 이미지 + 메시지 */}
        {isCenterMode && image && (
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            <img src={image} alt="브라쉬 장군"
              style={{ width:100, height:100, objectFit:"cover", borderRadius:12,
                border:"1px solid rgba(253,224,71,.25)", flexShrink:0,
                filter:"brightness(1.1) contrast(1.05)" }} />
            <div style={{ fontSize:13, color:"rgba(255,255,255,.88)", lineHeight:1.8, whiteSpace:"pre-line" }}>{desc}</div>
          </div>
        )}

        {/* 일반 페이지: 제목 + 설명 */}
        {!isCenterMode && (<>
          {title && (
            <div style={{ fontSize:17, fontWeight:700, color:"#fde047",
              textShadow:"0 0 12px rgba(253,224,71,.5)", lineHeight:1.3 }}>{title}</div>
          )}
          <div style={{ fontSize:13, color:"rgba(255,255,255,.82)", lineHeight:1.75, whiteSpace:"pre-line" }}>{desc}</div>
        </>)}

        {/* 버튼 */}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:2 }}>
          {step > 0 && (
            <button type="button" onClick={onPrev} style={{
              padding:"7px 16px", borderRadius:999,
              border:"1px solid rgba(255,255,255,.18)", background:"rgba(255,255,255,.06)",
              color:"rgba(255,255,255,.75)", fontWeight:700, fontSize:12, cursor:"pointer",
            }}>이전</button>
          )}
          <button type="button" onClick={isLast ? onClose : onNext} style={{
            padding:"7px 20px", borderRadius:999,
            border:"1px solid rgba(253,224,71,.6)", background:"rgba(253,224,71,.13)",
            color:"#fde047", fontWeight:700, fontSize:12, cursor:"pointer",
            boxShadow:"0 0 10px rgba(253,224,71,.25)",
            animation:"tutGlow 1.6s ease-in-out infinite",
          }}>{isLast ? "완료" : "다음"}</button>
        </div>
        {/* 하단 안내 */}
        <div style={{ fontSize:11, color:"rgba(255,255,255,.28)", textAlign:"center", marginTop:2 }}>
          창 밖 영역을 클릭해 튜토리얼을 바로 종료할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

const ERGO_UPGRADE = { "낮음":"보통", "보통":"높음", "투척":"투척" };
const ERGO_LABEL  = { "낮음":"핸들링 낮음", "보통":"핸들링 보통", "높음":"핸들링 높음", "투척":"투척" };
const IDEAL_BLUE   = "#60a5fa";
const IDEAL_BLUE_STYLE = {
  background:"rgba(96,165,250,.12)", borderColor:"rgba(96,165,250,.40)", color:IDEAL_BLUE,
};
const ERGO_COL_W = 48; // Ergo 배지 열 고정 너비(px)

// 라벨 색상: 주/보조/투척 노란색, 지원무기 지원색, 스트라타젬 대분류는 공격/방어 색
const FIREFORM_LABEL_COLOR = (label) => {
  if (["주무기","보조무기","투척무기"].includes(label)) return "#fde047";
  if (label === "지원무기") return "#bfe1f6";
  if (["이글","궤도"].includes(label))                 return "#fe5f47";
  if (["센트리","거치포","배치형"].includes(label))     return "#d4edbc";
  if (label === "탑승물") return "#93c5fd";
  return "#bfe1f6"; // 배낭 등 나머지 지원 계열
};

const RESP_STYLE = {
  "빠름": { label:"빠른 호출", bg:"rgba(134,239,172,.15)", border:"rgba(134,239,172,.40)", color:"#86efac" },
  "보통": { label:"평균 호출", bg:"rgba(253,224,71,.12)",  border:"rgba(253,224,71,.35)",  color:"#fde047" },
  "느림": { label:"느린 호출", bg:"rgba(248,113,113,.15)", border:"rgba(248,113,113,.40)", color:"#f87171" },
};

function FireformRow({ row, hasIdealBody }) {
  const f      = row.form    ?? "";
  const id     = row.id      ?? "";
  const isCqc  = id.includes("cqc");
  const subNotes     = Array.isArray(row.subNotes)     ? row.subNotes     : [];
  const passiveNotes = Array.isArray(row.passiveNotes) ? row.passiveNotes : [];
  const responseTime = row.responseTime ?? "";

  // 이상적인 체형: Ergo 업그레이드 (투척 제외)
  const isIdealTarget = hasIdealBody && row.ergo !== "투척";
  const ergo      = isIdealTarget ? (ERGO_UPGRADE[row.ergo] ?? row.ergo) : (row.ergo ?? "");
  const ergoStyle = isIdealTarget ? IDEAL_BLUE_STYLE : getErgoBadgeStyle(ergo);
  const nameColor = isIdealTarget ? IDEAL_BLUE : "rgba(255,255,255,.75)";

  // passiveNotes(pos) → subNotes(pos) → subNotes(neg) 순으로 표시
  const allPos = [...passiveNotes.filter(n => n.kind === "pos"), ...subNotes.filter(n => n.kind === "pos")];
  const allNeg = subNotes.filter(n => n.kind === "neg");
  const orderedNotes = [...allPos, ...allNeg];

  const respStyle = RESP_STYLE[responseTime] ?? null;

  const fStyle = getFireformBadgeStyle(f);

  return (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, minWidth:0 }}>
      {/* 라벨 */}
      <span style={{
        width:56, flexShrink:0,
        fontSize:12, color:FIREFORM_LABEL_COLOR(row.label), fontWeight:700,
        whiteSpace:"nowrap", lineHeight:1,
        display:"flex", alignItems:"flex-start", paddingTop:2,
      }}>{row.label}</span>
      {/* 명칭 + 노트 + 배지 */}
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:13, color:nameColor, fontWeight:600, wordBreak:"keep-all", overflowWrap:"break-word" }}>{row.name}</span>
        {orderedNotes.map((n,i) => (
          <span key={i} style={{ fontSize:12, fontWeight:700, opacity:.95,
            color: n.kind === "pos" ? "#86efac" : "#f87171" }}>
            {n.kind === "neg" ? `- ${n.text}` : `+ ${n.text}`}
          </span>
        ))}
        {/* 배지 행 */}
        {(f || ergoStyle || respStyle) && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:1 }}>
            {f && <span className="statFireformBadge" style={{ ...fStyle, margin:0 }}>{f}</span>}
            {respStyle && <span className="statFireformBadge" style={{ background:respStyle.bg, border:`1px solid ${respStyle.border}`, color:respStyle.color, margin:0 }}>{respStyle.label}</span>}
            {!respStyle && ergoStyle && <span className="statFireformBadge" style={{ ...ergoStyle, margin:0 }}>{ERGO_LABEL[ergo] ?? ergo}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [tutorialStep, setTutorialStep] = useState(-1); // -1=숨김, 0~N=진행중
  const [items,        setItems]        = useState([]);
  const [err,          setErr]          = useState("");
  const [isLoading,    setIsLoading]    = useState(true);
  const [selected,     setSelected]     = useState(EMPTY_SELECTED);
  const [picker,       setPicker]       = useState({ open:false, slotKey:"", slotKind:"", typeKey:"", pickedId:null });

  const [savedLoadouts,   setSavedLoadouts]   = useState([]);
  const [activeLoadoutId, setActiveLoadoutId] = useState(null);
  const [saveModal,       setSaveModal]       = useState({ open:false, name:"" });
  const [manageModal,     setManageModal]     = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState(null);
  const [resetConfirm,    setResetConfirm]    = useState(false);
  const [infoModal,       setInfoModal]       = useState(false);
  const [editingId,       setEditingId]       = useState(null);   // 이름 편집 중인 로드아웃 id
  const [editingName,     setEditingName]     = useState("");

  /* PNG 캡처 대상: mainCol 전체 */
  const captureRef = useRef(null);

  /* ── 아이템 로드 & 기본 프리셋 자동 적용 ── */
  useEffect(() => {
    if (!DEPLOYMENT_ID) {
      setErr("VITE_GAS_DEPLOYMENT_ID 가 설정되지 않았습니다 (.env.local 확인)");
      return;
    }
    fetch(`/api/macros/s/${DEPLOYMENT_ID}/exec?nocache=1&t=${Date.now()}`)
      .then(async r => {
        const text=await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,120)}`);
        try { return JSON.parse(text); }
        catch { throw new Error(`Not JSON: ${text.slice(0,120)}`); }
      })
      .then(d => {
        setErr("");
        const loaded=(Array.isArray(d?.items)?d.items:[]).map(normalizeItem);
        setItems(loaded);
        setIsLoading(false);

        const stored=lsGet();
        const byId=new Map(loaded.map(it=>[it.id,it]));

        /* 기본 프리셋 매핑 */
        const defSel = {
          stratagem: DEFAULT_LOADOUT_IDS.stratagem.map(id=>id?(byId.get(id)??null):null),
          armor:     byId.get(DEFAULT_LOADOUT_IDS.armor)     ?? null,
          primary:   byId.get(DEFAULT_LOADOUT_IDS.primary)   ?? null,
          secondary: byId.get(DEFAULT_LOADOUT_IDS.secondary) ?? null,
          throwable: byId.get(DEFAULT_LOADOUT_IDS.throwable) ?? null,
        };

        /* defSel에 실제로 아이템이 있는지 검사 */
        const defHasItems = defSel.armor || defSel.primary || defSel.stratagem.some(Boolean);

        const defaultPreset = {
          id:"__default__", name:"기본 제공 로드아웃",
          selected:defSel, isDefault:true, createdAt:"",
        };

        const userList=(stored?.list??[]).filter(l=>l.id!=="__default__");
        const merged=[defaultPreset,...userList];
        setSavedLoadouts(merged);

        /* 마지막 사용 로드아웃 복원 */
        const lastId=stored?.lastId;
        if (lastId && lastId!=="__default__") {
          const found=merged.find(l=>l.id===lastId);
          if (found) { setSelected({...found.selected}); setActiveLoadoutId(lastId); return; }
        }
        /* 기본 제공 로드아웃 자동 선택
           — lastId가 없거나, "__default__"이거나, 찾을 수 없는 경우 모두 해당 */
        setSelected({
          stratagem:[...defSel.stratagem],
          armor:    defSel.armor,
          primary:  defSel.primary,
          secondary:defSel.secondary,
          throwable:defSel.throwable,
        });
        setActiveLoadoutId("__default__");
      })
      .catch(e=>{ setErr(String(e)); setIsLoading(false); });
  }, []);

  function persistList(list, lastId) {
    lsSet({ list:list.filter(l=>!l.isDefault), lastId });
  }

  /* ── 파생 상태 ── */
  const itemsByType = useMemo(()=>{
    const m=new Map();
    for (const it of items) {
      const t=it.type||"unknown";
      if (!m.has(t)) m.set(t,[]);
      m.get(t).push(it);
    }
    return m;
  },[items]);

  const selectedStratagemIds = useMemo(()=>{
    const ids=new Set();
    for (const st of selected.stratagem) { if (st?.id) ids.add(String(st.id)); }
    return ids;
  },[selected.stratagem]);

  const activeSlotIndex = useMemo(()=>{
    if (!picker.slotKey.startsWith("stratagem:")) return 0;
    return Number(picker.slotKey.split(":")[1]);
  },[picker.slotKey]);

  const hasBackpackWeaponSelected = useMemo(
    ()=>selected.stratagem.some(it=>it&&getSubType(it)===SUBTYPE_BACKPACK_WEAPON),
    [selected.stratagem]
  );

  const stats = useMemo(() => {
    /* ── 무기 특성 ── */
    const allTraits = [];
    for (const k of ["primary","secondary","throwable"]) {
      const it = selected[k]; if (!it) continue;
      for (const f of ["trait1","trait2","trait3"]) { const t=s(it[f]); if(t) allTraits.push(t); }
    }

    /* ── 필요 채권 요약 (헬다이버 출동! 포함) ── */
    const wbPageMap = new Map();
    let hasSuperStore = false;
    const allItems = [
      selected.armor, selected.primary, selected.secondary, selected.throwable,
      ...selected.stratagem,
    ].filter(Boolean);
    for (const it of allItems) {
      const wb = s(it?.wbrequirement);
      if (!wb || wb==="기본") continue;
      if (wb.includes("슈퍼")&&wb.includes("스토어")) { hasSuperStore = true; continue; }
      const page = Number(s(it?.unlock)) || 0;
      const prev = wbPageMap.get(wb) ?? -1;
      if (page > prev) wbPageMap.set(wb, page);
    }
    const wbSummary = sortByWbOrder([...wbPageMap.entries()]).map(([wb, page]) => ({ wb, page }));
    if (hasSuperStore) wbSummary.push({ wb: "슈퍼스토어 구매", page: 0 });

    /* ════════════════════════════════════════════
       공통 상수
    ════════════════════════════════════════════ */
    const SUPPORT_WEAPON_SUBTYPES = new Set(["지원무기","일회용 지원무기","지원배낭 무기"]);

    const AT_EXCLUDE_IDS = ["sp_g4","g123","cqc20","sw_arc","bp_b100","gp20","bp_ax9","ep_at12","ep_md8"];
    // 대전차 전담을 부분적으로 강등시키는 아이템 (gp20 제외 — 대전차 전담 유지)
    const DEMOTE_AT_IDS  = ["g123","las99","stax3","500kg","orb_rc","orb_ls","orb_ps","cqc20","sw_arc","bp_b100","ep_at12"];
    // 단독으로 부분적 대전차 가능 태그를 표시하는 아이템 (gp20 포함)
    const PARTIAL_AT_IDS = [...DEMOTE_AT_IDS, "gp20"];
    const AT_SUPPORT_IDS = ["gr8","faf14","rr_","spear"];

    const FORCE_SMALL_IDS              = ["sw_flam","sp_flam","st_flam","p72"];
    const ERGO_FORCE_THROW_IDS         = ["sw_c4"];  // 지원무기 중 "투척" ergo 강제 표시
    const ROLE_SUPPRESS_IDS            = ["tx41"];    // bp_ax13은 별도 처리
    const GRENADE_PARTIAL_MED_EXCLUDE  = ["k2"];
    const GRENADE_PARTIAL_MED_FORCE    = ["g142"];
    // 중형 태그 억제: m102, bp_l182, ep_arc3
    const MED_SUPPRESS_IDS             = ["m102","bp_l182","ep_arc3","bp_ax75"];
    const PARTIAL_MED_SYNERGY_IDS = ["bp_ax75"];

    /* ─ 관통 등급 계산 ─ */
    let supportMaxPen = 0, hasDisposableAT = false, hasTrueATSupport = false;
    for (const it of selected.stratagem) {
      if (!it) continue;
      const id  = s(it?.id).toLowerCase();
      const sub = getSubType(it);
      if (!SUPPORT_WEAPON_SUBTYPES.has(sub)) continue;
      if (AT_EXCLUDE_IDS.some(ex => id.includes(ex))) continue;
      if (FORCE_SMALL_IDS.some(r => id.includes(r))) continue;
      const raw = s(it?.armorPen);
      if (!raw || raw==="비살상") continue;
      const n = Number(raw);
      if (!isNaN(n)) {
        if (n > supportMaxPen) supportMaxPen = n;
        if (n >= 6 && sub==="일회용 지원무기") hasDisposableAT = true;
        if (n >= 6 && AT_SUPPORT_IDS.some(aid => id.includes(aid))) hasTrueATSupport = true;
      }
    }

    let weaponMaxPen = 0;
    for (const k of ["primary","secondary"]) {
      const it = selected[k]; if (!it) continue;
      const id = s(it?.id).toLowerCase();
      if (FORCE_SMALL_IDS.some(r => id.includes(r))) continue;
      if (AT_EXCLUDE_IDS.some(ex => id.includes(ex))) continue;
      const raw = s(it?.armorPen);
      if (!raw || raw==="비살상") continue;
      const n = Number(raw);
      if (!isNaN(n) && n > weaponMaxPen) weaponMaxPen = n;
    }

    const throwableIt  = selected.throwable;
    const throwableId  = throwableIt ? s(throwableIt?.id).toLowerCase() : "";
    const throwableRaw = throwableIt ? s(throwableIt?.armorPen) : "";
    const throwablePen = (throwableRaw && throwableRaw !== "비살상") ? (Number(throwableRaw)||0) : 0;
    const hasGrenadePartialMed = throwableIt && (
      (throwableId.includes("th_")
        && throwablePen > 0 && throwablePen <= 4
        && !GRENADE_PARTIAL_MED_EXCLUDE.some(ex => throwableId.includes(ex)))
      || GRENADE_PARTIAL_MED_FORCE.some(f => throwableId.includes(f))
    );

    let stratOtherMaxPen = 0;
    for (const it of selected.stratagem) {
      if (!it) continue;
      const id  = s(it?.id).toLowerCase();
      const sub = getSubType(it);
      if (SUPPORT_WEAPON_SUBTYPES.has(sub)) continue;
      if (sub === "배낭") continue;                                   // 배낭형 서포트 제외
      if (AT_EXCLUDE_IDS.some(ex => id.includes(ex))) continue;      // 제외 목록 적용
      if (id.includes("st_orb") || id.includes("st_eag")) continue;
      if (MED_SUPPRESS_IDS.some(r => id.includes(r))) continue;
      const raw = s(it?.armorPen);
      if (!raw || raw==="비살상") continue;
      const n = Number(raw);
      if (!isNaN(n) && n > stratOtherMaxPen) stratOtherMaxPen = n;
    }

    const hasOrbOrEag = selected.stratagem.some(it => {
      if (!it) return false;
      const id = s(it?.id).toLowerCase();
      return id.includes("st_orb") || id.includes("st_eag");
    });

    const rolePen = supportMaxPen > 0 ? supportMaxPen
                  : weaponMaxPen  > 0 ? weaponMaxPen
                  : stratOtherMaxPen;

    const hasDemoteATId = allItems.some(it => {
      const id = s(it?.id).toLowerCase();
      return DEMOTE_AT_IDS.some(pid => id.includes(pid));
    });
    const hasPartialATId = allItems.some(it => {
      const id = s(it?.id).toLowerCase();
      return PARTIAL_AT_IDS.some(pid => id.includes(pid));
    });

    const vehicleItems = selected.stratagem.filter(it => it && getSubType(it)==="탑승물");
    const hasVehicle   = vehicleItems.length > 0;
    const hasVehicleAT = vehicleItems.some(it =>
      [s(it?.trait1),s(it?.trait2),s(it?.trait3)].some(t => t.includes("대전차"))
    );

    /* ─ 전투 보조: trait에 치유/기절/가스/아크 OR bp_b01, cqc1 제외 ─ */
    const SUPPORT_TRAITS  = new Set(["치유","기절","가스","아크"]);
    const COMBAT_SUPP_IDS = ["bp_b01"];
    const COMBAT_SUPP_EXCLUDE_IDS = ["ep_arc3"];
    const CQC_FORCE_IDS   = ["cqc1"];
    const hasCombatSupport = (() => {
      for (const k of ["primary","secondary","throwable"]) {
        const it = selected[k]; if (!it) continue;
        const id = s(it?.id).toLowerCase();
        if (CQC_FORCE_IDS.some(c => id.includes(c))) continue;
        if (COMBAT_SUPP_EXCLUDE_IDS.some(ex => id.includes(ex))) continue;
        if (COMBAT_SUPP_IDS.some(cid => id.includes(cid))) return true;
        for (const f of ["trait1","trait2","trait3"]) { if (SUPPORT_TRAITS.has(s(it[f]))) return true; }
      }
      for (const it of selected.stratagem) {
        if (!it) continue;
        const id = s(it?.id).toLowerCase();
        if (CQC_FORCE_IDS.some(c => id.includes(c))) continue;
        if (COMBAT_SUPP_EXCLUDE_IDS.some(ex => id.includes(ex))) continue;
        if (COMBAT_SUPP_IDS.some(cid => id.includes(cid))) return true;
        for (const f of ["trait1","trait2","trait3"]) { if (SUPPORT_TRAITS.has(s(it[f]))) return true; }
      }
      return false;
    })();

    const STEALTH_IDS = ["orb_ss","eag_ss","sp_g3","sp_g89"];

    /* ─ 역할 태그 색상 ─ */
    const C_AT      = "#ef4444"; // 대전차 빨강
    const C_PAT     = "#e05353"; // 부분적 대전차 진한 분홍
    const C_MED     = "#ffa32b"; // 중형 밝은 주황
    const C_SMALL   = "#94a3b8"; // 소형 회색
    const C_SUPP    = "#34d399";
    const C_VEHICLE = "#93c5fd";

    /* ─ 역할 태그 조립 ─ */
    // 대전차 전담 강등 조건: DEMOTE_AT_IDS 기준 (gp20 제외)
    const partialATActive  = (hasDisposableAT || hasDemoteATId) && !hasTrueATSupport;
    const upgradedByOrbEag = hasTrueATSupport && hasOrbOrEag;

    function weaponRoleTag() {
      const hasForceSmall = ["primary","secondary"].some(k => {
        const it = selected[k]; if (!it) return false;
        return FORCE_SMALL_IDS.some(r => s(it?.id).toLowerCase().includes(r));
      });
      if (hasForceSmall && weaponMaxPen === 0) return { label:"소형 적 대응", color:C_SMALL };
      if (weaponMaxPen >= 6) return { label:"대전차 전담",  color:C_AT    };
      if (weaponMaxPen >= 4) return { label:"중형 적 대응", color:C_MED   };
      if (weaponMaxPen >  0) return { label:"소형 적 대응", color:C_SMALL };
      if (hasForceSmall)     return { label:"소형 적 대응", color:C_SMALL };
      return null;
    }

    const hasForceSmallPrimary = ["primary","secondary"].some(k => {
      const it = selected[k]; if (!it) return false;
      return FORCE_SMALL_IDS.some(r => s(it?.id).toLowerCase().includes(r));
    });
    const hasForceSmallSupport = selected.stratagem.some(it => {
      if (!it) return false;
      const id  = s(it?.id).toLowerCase();
      const sub = getSubType(it);
      return SUPPORT_WEAPON_SUBTYPES.has(sub) && FORCE_SMALL_IDS.some(r => id.includes(r));
    });
    const hasForceSmall = hasForceSmallPrimary || hasForceSmallSupport;

    let mainRoleTag = null;
    if (rolePen >= 6) {
      mainRoleTag = partialATActive
        ? { label:"부분적 대전차 가능", color:C_PAT }
        : { label:"대전차 전담",        color:C_AT  };
    } else if (rolePen >= 4) {
      mainRoleTag = { label:"중형 적 대응", color:C_MED   };
    } else if (rolePen > 0) {
      mainRoleTag = { label:"소형 적 대응", color:C_SMALL };
    } else if (hasForceSmall) {
      mainRoleTag = { label:"소형 적 대응", color:C_SMALL };
    }
    if (upgradedByOrbEag && mainRoleTag) mainRoleTag = { label:"대전차 전담", color:C_AT };

    let extraWeaponTag = null;
    if (mainRoleTag?.label === "부분적 대전차 가능") extraWeaponTag = weaponRoleTag();

    let loosePartialTag = null;
    if ((hasPartialATId || hasDisposableAT) && !hasTrueATSupport && rolePen < 6 && mainRoleTag?.label !== "부분적 대전차 가능")
      loosePartialTag = { label:"부분적 대전차 가능", color:C_PAT };

    const grenadeTag = hasGrenadePartialMed
      ? { label:"부분적 중형 적 대응", color:C_MED }
      : null;

    const hasPartialMedStrat = selected.stratagem.some(it => {
      if (!it) return false;
      return PARTIAL_MED_SYNERGY_IDS.some(r => s(it?.id).toLowerCase().includes(r));
    });
    const partialMedStratTag = hasPartialMedStrat
      ? { label:"부분적 중형 적 대응", color:C_MED }
      : null;

    const ROLE_ORDER = ["소형 적 대응","중형 적 대응","대전차 전담","부분적 중형 적 대응","부분적 대전차 가능","부분적 대전차(탑승물)"];
    const roleCandidates = [];
    if (extraWeaponTag)  roleCandidates.push(extraWeaponTag);
    if (mainRoleTag)     roleCandidates.push(mainRoleTag);
    if (grenadeTag) {
      if (!roleCandidates.some(t => t.label==="중형 적 대응")) roleCandidates.push(grenadeTag);
    }
    if (partialMedStratTag) {
      if (!roleCandidates.some(t => t.label === "부분적 중형 적 대응"))
        roleCandidates.push(partialMedStratTag);
    }
    if (loosePartialTag) roleCandidates.push(loosePartialTag);

    // ── 상위 태그 우선: 부분적 < 전담 ──
    // "대전차 전담"이 있으면 "부분적 대전차 가능" 제거
    const hasFullAT  = roleCandidates.some(t => t.label === "대전차 전담");
    const hasFullMed = roleCandidates.some(t => t.label === "중형 적 대응");
    const filteredCandidates = roleCandidates.filter(t => {
      if (hasFullAT  && t.label === "부분적 대전차 가능")   return false;
      if (hasFullMed && t.label === "부분적 중형 적 대응")  return false;
      return true;
    });

    // bp_ax13(가스 유탄 발사기)은 역할 분류 태그 전체 억제 (전투보조는 별도 추가)
    const hasBpAx13 = allItems.some(it => s(it?.id).toLowerCase().includes("bp_ax13"));

    const suppressRole = hasBpAx13 || allItems.some(it => {
      const id = s(it?.id).toLowerCase();
      return ROLE_SUPPRESS_IDS.some(r => id.includes(r));
    });
    // MED_SUPPRESS_IDS 중 bp_ax75 제외 항목이 있을 때만 중형 태그 억제
    const MED_SUPPRESS_NON_PARTIAL = ["m102","ep_arc3"];
    const suppressMed = allItems.some(it => {
      const id = s(it?.id).toLowerCase();
      return MED_SUPPRESS_NON_PARTIAL.some(r => id.includes(r));
    });

    const roleTags = [];
    if (!suppressRole) {
      const seenRoles = new Set();
      for (const tag of filteredCandidates) {
        if (suppressMed && tag.label === "중형 적 대응") continue;
        if (!seenRoles.has(tag.label)) { seenRoles.add(tag.label); roleTags.push(tag); }
      }
      roleTags.sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a.label), bi = ROLE_ORDER.indexOf(b.label);
        if (ai===-1&&bi===-1) return 0;
        if (ai===-1) return 1; if (bi===-1) return -1;
        return ai-bi;
      });
    }
    // 전투 보조 → 부분적 대전차(탑승물) → 탑승물 운용 (마지막)
    if (hasCombatSupport) roleTags.push({ label:"전투 보조",            color:C_SUPP    });
    if (hasVehicleAT)     roleTags.push({ label:"부분적 대전차(탑승물)", color:"#93c5fd" });
    if (hasVehicle)       roleTags.push({ label:"탑승물 운용",           color:C_VEHICLE });

    /* ════════════════════════════════════════════
       구성 시너지
    ════════════════════════════════════════════ */
    const RANGE_IDS         = ["sg8p","plas101","g4","plas15"];
    const BARRAGE_IDS       = ["mp98","p19","las16","las17","mg105","mg101","m1000","m105","st_g16"];
    const PRECISE_IDS       = ["dm_r2124","dm_r63","en_las5","dm_r63cs","ps_p4","dm_r6","dm_r2","plas39","dm_r72","las98","sw_apw1"];
    const AREA_CC_IDS       = ["sp_g4","orb_gs","orb_ss","sp_g23","orb_ems"];
    const STOP_IDS          = ["sp_p35","sp_g109","ar23c","ar32","smg72","sp_k2","sg20","arc-12","sg_sg8","sg_sg8s","sg_sg451","sg_sg20","sg_m90a"];
    const CQC_IDS           = ["cqc"];
    const SINGLE_ENTITY_IDS = ["faf14","stax3"];
    const FORCE_RANGE_IDS   = ["gl52","eat700","bp_flam","sw_flam","sp_flam","p72"];
    const FORCE_SINGLE_IDS  = ["sg451","st_mls4x","g123"];
    // 신규: 단일|탄막형
    const DUAL_BARRAGE_IDS  = ["sw_ac8"];
    // 탑승물 전용 (td220 제거 — 별도 PARTIAL_MED 처리)
    const VEHICLE_SYNERGY   = { "exo45":"탄막 | 대전차", "td220":"범용 대전차" };
    // bp_ax75 → 부분적 중형 (구성 시너지 라벨 오버라이드)
    // 포격/투사 태그
    const FORWARD_IDS       = ["eag_sr","eag_110mm","eag_500kg","orb_wb"];
    const LATERAL_IDS       = ["eag_as","eag_cb","eag_ns"];
    const AREA_ORB_IDS      = ["orb_gb","orb_120mm","orb_as","orb_380mm","orb_np"];
    // 기타 구성 태그
    const LURE_IDS          = ["sp_tm1"];
    const SHIELD_IDS        = ["gsh39","sh32","fx12"];
    const BARRIER_IDS       = ["sh20","sh51"];
    const MOBILITY_IDS      = ["l850","l860","l182","m102"];

    // 지원무기가 스트라타젬에 선택됐는지 확인
    const hasSupportWeaponInStrat = selected.stratagem.some(
      it => it && SUPPORT_WEAPON_SUBTYPES.has(getSubType(it))
    );

    function getFireformLabel(it) {
      if (!it) return null;
      const id     = s(it?.id).toLowerCase();
      const wt     = s(it?.weaponType);
      const traits = [s(it?.trait1), s(it?.trait2), s(it?.trait3)];
      const hasExplosive = traits.includes("폭발성");

      for (const [vid, vlabel] of Object.entries(VEHICLE_SYNERGY)) {
        if (id.includes(vid)) return vlabel;
      }
      if (PARTIAL_MED_SYNERGY_IDS.some(r => id.includes(r))) return "부분적 중형 적 대응";
      // ep_arc3: 구역 화력투사 (FORCE_RANGE 매칭보다 우선)
      if (id === "st_ep_arc3") return "구역 화력투사";
      if (FORWARD_IDS.some(r => id.includes(r)))      return "전진형 화력투사";
      if (LATERAL_IDS.some(r => id.includes(r)))      return "횡방향 화력투사";
      if (AREA_ORB_IDS.some(r => id.includes(r)))     return "구역 화력투사";
      if (LURE_IDS.some(r => id.includes(r)))         return "적 유인";
      if (SHIELD_IDS.some(r => id.includes(r)))       return "방어막";
      if (BARRIER_IDS.some(r => id.includes(r)))      return "전방 방어";
      if (MOBILITY_IDS.some(r => id.includes(r)))     return "기동력, 지형 활용";
      if (CQC_IDS.some(r => id.includes(r)))          return "근접";
      if (AREA_CC_IDS.some(r => id.includes(r)))      return "범위 CC";
      if (STOP_IDS.some(r => id.includes(r)))         return "대상 저지";
      if (SINGLE_ENTITY_IDS.some(r => id.includes(r))) return "단일 대상";
      if (DUAL_BARRAGE_IDS.some(r => id.includes(r))) return "단일 | 탄막형";
      if (FORCE_RANGE_IDS.some(r => id.includes(r)))  return "범위형";
      if (FORCE_SINGLE_IDS.some(r => id.includes(r))) return "단일 대상";
      if (id.includes("mg43")) return id.includes("sw_") ? "탄막형" : "단일 대상";
      if (BARRAGE_IDS.some(r => id.includes(r)))      return "탄막형";
      if (PRECISE_IDS.some(r => id.includes(r)))      return "단일 정밀";
      if (id.includes("ar21") || id.includes("ar_21")) {
        if (hasExplosive) return "단일 | 범위형(하부 유탄 한정)";
      }
      if (wt==="폭발" || hasExplosive || RANGE_IDS.some(r => id.includes(r))) return "범위형";
      return "단일 대상";
    }

    function resolveItemForm(it) {
      if (!it) return null;
      const id = s(it?.id).toLowerCase();
      if (STEALTH_IDS.some(sid => id.includes(sid)) && !id.includes("g31")) return "위치 은폐";
      if (CQC_FORCE_IDS.some(c => id.includes(c))) return "근접";
      const isCombatSupp = COMBAT_SUPP_IDS.some(cid => id.includes(cid))
        || [s(it.trait1),s(it.trait2),s(it.trait3)].some(t => SUPPORT_TRAITS.has(t));
      if (isCombatSupp) return "전투 보조";
      return getFireformLabel(it);
    }

    const GEAR_LABELS = { primary:"주무기", secondary:"보조무기", throwable:"투척무기" };
    const ERGO_GEAR_KINDS = new Set(["primary","secondary","throwable"]);
    const armorPassive = s(selected.armor?.passive);
    const hasIdealBody = armorPassive === "이상적인 체형";

    const fireformGear = [];
    for (const k of ["primary","secondary","throwable"]) {
      const it = selected[k]; if (!it) continue;
      const form = resolveItemForm(it);
      let ergo = "";
      if (ERGO_GEAR_KINDS.has(k)) {
        ergo = s(it?.ergo ?? "");
        if (k === "throwable" && !ergo) ergo = "투척";
      }
      const id = s(it?.id ?? "").toLowerCase();
      const subNotes = [];
      const traits = [s(it?.trait1),s(it?.trait2),s(it?.trait3)];
      if (traits.some(t => t.includes("과열"))) {
        subNotes.push({ text:"과열시 관통 등급 향상", kind:"pos" });
        if (armorPassive === "인화성 물질") {
          subNotes.push({ text:"과열 피해 감소", kind:"pos" });
        } else {
          subNotes.push({ text:"과열 피해", kind:"neg" });
        }
      }
      fireformGear.push({ label:GEAR_LABELS[k], name:s(it.name_ko||it.id), form, ergo, id, subNotes, passiveNotes:[] });
    }
    // 지원무기가 스트라타젬에 있으면 지원무기 종류도 개인장비 열에 표시
    if (hasSupportWeaponInStrat) {
      for (const it of selected.stratagem) {
        if (!it) continue;
        const sub = getSubType(it);
        if (!SUPPORT_WEAPON_SUBTYPES.has(sub)) continue;
        const form = resolveItemForm(it);
        const id   = s(it?.id ?? "").toLowerCase();
        const ergo = ERGO_FORCE_THROW_IDS.some(r => id.includes(r)) ? "투척" : s(it?.ergo ?? "");
        // subType 무관하게 라벨은 "지원무기"로 통일, subNotes 배열로 누적
        const subNotes = [];
        if (sub === "지원배낭 무기")    subNotes.push({ text:"배낭 제한",       kind:"neg" });
        if (sub === "일회용 지원무기")  subNotes.push({ text:"사용후 폐기",     kind:"neg" });
        if (s(it?.sreload).toLowerCase() === "yes") subNotes.push({ text:"정지 재장전",   kind:"neg" });
        if (["orb_ls","vh_exo"].some(r => id.includes(r))) subNotes.push({ text:"사용횟수 제한", kind:"neg" });
        if (id.includes("sw_m1000")) subNotes.push({ text:"이동사격 불가", kind:"neg" });
        const supportTraits = [s(it?.trait1),s(it?.trait2),s(it?.trait3)];
        if (supportTraits.some(t => t.includes("과열"))) {
          subNotes.push({ text:"과열시 관통 등급 향상", kind:"pos" });
          if (armorPassive === "인화성 물질") {
            subNotes.push({ text:"과열 피해 감소", kind:"pos" });
          } else {
            subNotes.push({ text:"과열 피해", kind:"neg" });
          }
        }
        // 민주주의의 가호 + bp_b100 → 특수 메시지 (스트라타젬 열에서 처리)
        fireformGear.push({ label:"지원무기", name:s(it.name_ko||it.id), form, ergo, id, subNotes, passiveNotes:[] });
      }
    }

    const fireformStrat = [];
    for (const it of selected.stratagem) {
      if (!it) continue;
      // 지원무기 종류는 개인장비 열에만 표시 (스트라타젬 열 제외)
      if (SUPPORT_WEAPON_SUBTYPES.has(getSubType(it))) continue;
      const form = resolveItemForm(it);
      if (!form) continue;
      const id = s(it?.id ?? "").toLowerCase();
      const subNotes = [];
      if (s(it?.sreload).toLowerCase() === "yes") subNotes.push({ text:"정지 재장전",   kind:"neg" });
      if (["orb_ls","vh_exo"].some(r => id.includes(r))) subNotes.push({ text:"사용횟수 제한", kind:"neg" });
      if (id.includes("sw_m1000")) subNotes.push({ text:"이동사격 불가", kind:"neg" });
      // 민주주의의 가호 + bp_b100 → 특수 메시지
      if (id.includes("bp_b100") && armorPassive === "민주주의의 가호")
        subNotes.push({ text:"당신은 민주주의를 믿나?", kind:"pos" });
      // 호출 시간: stratType이 공격/방어 또는 subType이 탑승물인 경우
      const stratType  = s(it?.stratType ?? "");
      const stratSub   = s(it?.subType ?? it?.subtype ?? "");
      const respTime   = s(it?.responseTime ?? "");
      const showResp   = !!(respTime && (["공격","방어"].includes(stratType) || stratSub === "탑승물"));
      fireformStrat.push({ label:s(getSubType(it)||"스트라타젬"), name:s(it.name_ko||it.id), form, ergo:"", id, subNotes, responseTime: showResp ? respTime : "" });
    }

    /* ════════════════════════════════════════════
       방어구 패시브 노트 계산
    ════════════════════════════════════════════ */

    // 아이템 trait 헬퍼
    const hasTrait = (it, keyword) =>
      [s(it?.trait1),s(it?.trait2),s(it?.trait3)].some(t => t.includes(keyword));

    // 구성 시너지 fireform 태그 (지원무기 포함 전체)
    const allFireformLabels = [
      ...fireformGear.map(r => r.form),
      ...fireformStrat.map(r => r.form),
    ];
    const hasFormLabel = (lbl) => allFireformLabels.some(f => s(f).includes(lbl));

    // subType 헬퍼
    const isBackpackWeapon  = (it) => getSubType(it) === "지원배낭 무기";
    const isDisposable      = (it) => getSubType(it) === "일회용 지원무기";
    const isSupportWeapon   = (it) => SUPPORT_WEAPON_SUBTYPES.has(getSubType(it));
    const isSupportInStrat  = (it) => isSupportWeapon(it) &&
      selected.stratagem.some(s2 => s2 && s(s2?.id)===s(it?.id));

    // 지원무기 아이템 목록 (스트라타젬에서)
    const supportItems = selected.stratagem.filter(it =>
      it && SUPPORT_WEAPON_SUBTYPES.has(getSubType(it))
    );

    // 패시브 노트 계산 함수 (gear/strat 공용)
    // 사격 가능한 무기 form 태그 집합 (스트라타젬 열에서 사격 관련 패시브 표시 여부 판단)
    const SHOOTING_FORMS = new Set([
      "단일 대상","범위형","단일 | 범위형","탄막형","단일 | 탄막형",
      "저지형","정밀형","근접","전진형 화력투사","횡방향 화력투사","구역 화력투사",
    ]);

    function calcPassiveNotes(it, rowLabel, rowForm, rowErgo) {
      if (!armorPassive || !it) return [];
      const posNotes = [];
      const itId        = s(it?.id).toLowerCase();
      const isBpWeapon  = isBackpackWeapon(it);
      const isDisp      = isDisposable(it);
      const isPrimary   = rowLabel === "주무기";
      const isSecondary = rowLabel === "보조무기";
      const isThrowable = rowLabel === "투척무기";
      const isSupportRow= rowLabel === "지원무기";
      // 스트라타젬 열: form 태그가 실제 사격 가능한 무기인 경우만 사격 패시브 적용
      const isStratRow  = !isPrimary && !isSecondary && !isThrowable && !isSupportRow;
      const isShootingStrat = isStratRow && SHOOTING_FORMS.has(s(rowForm));

      // ── 강화 → 반동 감소 (플라즈마 특성 보유 항목만 / 슬롯 무관)
      if (armorPassive === "강화") {
        if (hasTrait(it, "플라즈마"))
          posNotes.push("반동 감소");
      }
      // ── 공병 키트 → 반동 감소 (주무기, 보조무기, 지원무기)
      if (armorPassive === "공병 키트") {
        if (isPrimary || isSecondary || isSupportRow)
          posNotes.push("반동 감소");
      }
      // ── 공병 키트 / 통합 폭발물 → 투입시 추가 보유 + 최대 소지량 (투척무기)
      if (["공병 키트","통합 폭발물"].includes(armorPassive)) {
        if (isThrowable) posNotes.push("투입시 추가 보유", "최대 소지량");
      }
      // ── 서보 보조 / 사막 돌격대 → 투척 비거리
      //    투척무기(type="투척무기") 또는 공격 스트라타젬(stratType="공격") 중 range="투척",
      //    또는 ERGO_FORCE_THROW_IDS(sw_c4 등), sp_g50 제외
      if (["서보 보조","사막 돌격대"].includes(armorPassive)) {
        const isThrowRange = s(it?.range) === "투척" &&
          (s(it?.type) === "투척무기" || s(it?.stratType) === "공격");
        const isForceThrow = ERGO_FORCE_THROW_IDS.some(r => itId.includes(r));
        if ((isThrowRange || isForceThrow) && !itId.includes("sp_g50"))
          posNotes.push("투척 비거리");
      }
      // ── 이상적인 체형 / 강화된 견장 / 굳건한 바위 → 근접 공격 피해량 (cqc/총검)
      if (["이상적인 체형","강화된 견장","굳건한 바위"].includes(armorPassive)) {
        if (itId.includes("cqc") || hasTrait(it, "총검"))
          posNotes.push("근접 공격 피해량");
      }
      // ── 포위 준비 완료 / 강화된 견장 → 재장전 속도 (주무기, 지원무기 / 스트라타젬 제외)
      if (["포위 준비 완료","강화된 견장"].includes(armorPassive)) {
        const excluded = ["en_arc","sw_arc","sw_las99","cqc"].some(ex => itId.includes(ex))
          || isBpWeapon || isDisp;
        if ((isPrimary || isSupportRow) && !excluded)
          posNotes.push("재장전 속도");
      }
      // ── 강화 / 탄도 완충제 → 폭발 피해 감소 (폭발성 또는 플라즈마 특성)
      if (["강화","탄도 완충제"].includes(armorPassive)) {
        if (hasTrait(it, "폭발성") || hasTrait(it, "플라즈마")) posNotes.push("폭발 피해 감소");
      }
      // ── 이상적인 체형 → 핸들링 향상 (주무기, 보조무기, 지원무기 / 스트라타젬 제외)
      if (armorPassive === "이상적인 체형") {
        if ((isPrimary || isSecondary || isSupportRow) && rowErgo !== "투척")
          posNotes.push("핸들링 향상");
      }
      // ── 인화성 물질 → 화염 피해 감소 (소이 특성 보유 + 해당 무기 자체가 소이 관련 form)
      if (armorPassive === "인화성 물질") {
        const soiForm = s(rowForm);
        if (hasTrait(it, "소이") &&
            (soiForm.includes("범위형") || soiForm.includes("횡방향 화력투사") || soiForm.includes("구역 화력투사")))
          posNotes.push("화염 피해 감소");
      }
      // ── 고급 여과 → 가스 피해 감소 (특정 ID)
      if (armorPassive === "고급 여과") {
        const GAS_IDS = ["sp_g4","orb_gs","sw_tx41","bp_ax13","sw_s11","ep_md8"];
        if (GAS_IDS.some(r => itId.includes(r))) posNotes.push("가스 피해 감소");
      }
      // ── 결연함 → 1인칭 피격 흔들림 감소 (주무기, 보조무기, 지원무기 / 스트라타젬 제외)
      if (armorPassive === "결연함") {
        if (isPrimary || isSecondary || isSupportRow)
          posNotes.push("1인칭 피격 흔들림 감소");
      }
      // ── 포위 준비 완료 → 추가 탄약 (주무기, 지원무기 / 스트라타젬 제외)
      if (armorPassive === "포위 준비 완료") {
        const excAmmo =
          itId.includes("sp_gp20") || itId.includes("sw_las99") ||
          itId.includes("pr_arc")  || itId.includes("sw_arc") ||
          (itId.includes("cqc") && !itId.includes("cqc20")) ||
          isBpWeapon || isDisp || isThrowable;
        if (!excAmmo && (isPrimary || isSupportRow))
          posNotes.push("추가 탄약");
      }
      // ── 총잡이 → 재장전 속도, 전환 속도, 반동 감소 (보조무기)
      if (armorPassive === "총잡이" && isSecondary)
        posNotes.push("재장전 속도", "전환 속도", "반동 감소");
      // ── 전도성 / 아드레노-제세동기 → 아크 피해 감소 (아크 특성, en_arc12·sw_arc 제외)
      if (["전도성","아드레노-제세동기"].includes(armorPassive)) {
        if (hasTrait(it, "아크") && !itId.includes("en_arc12") && !itId.includes("sw_arc")) posNotes.push("아크 피해 감소");
      }
      return posNotes.map(t => ({ text: t, kind:"pos" }));
    }

    // 각 fireformGear row에 passiveNotes 주입
    for (const row of fireformGear) {
      if (!armorPassive) { row.passiveNotes = []; continue; }
      const it = (() => {
        if (row.label === "주무기")   return selected.primary;
        if (row.label === "보조무기") return selected.secondary;
        if (row.label === "투척무기") return selected.throwable;
        return supportItems.find(si => s(si?.id).toLowerCase() === row.id) ?? null;
      })();
      row.passiveNotes = calcPassiveNotes(it, row.label, row.form, row.ergo);
    }

    // 각 fireformStrat row에 passiveNotes 주입
    for (const row of fireformStrat) {
      if (!armorPassive) { row.passiveNotes = []; continue; }
      const it = selected.stratagem.find(si => si && s(si?.id).toLowerCase() === row.id) ?? null;
      row.passiveNotes = calcPassiveNotes(it, row.label, row.form, row.ergo);
    }

    /* ── "없음(개인 목록)" 패시브 — armorPersonalNotes ── */
    const armorPersonalNotes = [];
    if (armorPassive) {
      // 구급 키트 / 아드레노-제세동기 → 각성제 지속시간
      if (["구급 키트","아드레노-제세동기"].includes(armorPassive))
        armorPersonalNotes.push("각성제 지속시간");
      // 아드레노-제세동기 → 시한부 부활
      if (armorPassive === "아드레노-제세동기")
        armorPersonalNotes.push("신체가 온전한 상태로 사망시 시한부 부활");
      // 구급 키트 → 투입시 각성제 추가 보유
      if (armorPassive === "구급 키트")
        armorPersonalNotes.push("투입시 각성제 추가 보유");
      // 민주주의의 가호 / 탄도 완충제 → 출혈 피해 무효
      if (["민주주의의 가호","탄도 완충제"].includes(armorPassive))
        armorPersonalNotes.push("출혈 피해 무효");
      // 민주주의의 가호 → 확률적 사망 방지
      if (armorPassive === "민주주의의 가호")
        armorPersonalNotes.push("확률적 사망 방지");
      // 정찰 / 신호 감소 → 적 탐지 범위 감소
      if (["정찰","신호 감소"].includes(armorPassive))
        armorPersonalNotes.push("적 탐지 범위 감소");
      // 정찰 / 결연함 → 위치 지정 탐지
      if (["정찰","결연함"].includes(armorPassive))
        armorPersonalNotes.push("위치 지정 탐지");
      // 발 먼저 / 신호 감소 → 소음 범위 감소
      if (["발 먼저","신호 감소"].includes(armorPassive))
        armorPersonalNotes.push("소음 범위 감소");
      // 서보 보조 → 사지 체력 증가
      if (armorPassive === "서보 보조")
        armorPersonalNotes.push("사지 체력 증가");
      // 탄도 완충제 → 흉부 한정 피해감소
      if (armorPassive === "탄도 완충제")
        armorPersonalNotes.push("흉부 한정 피해감소");
      // 통합 폭발물 → 사망시 시체 폭발 (neg)
      if (armorPassive === "통합 폭발물")
        armorPersonalNotes.push({ text:"사망시 시체 폭발", kind:"neg" });
      // 발 먼저 → 관심 지역 탐지 범위, 다리 부상 면역
      if (armorPassive === "발 먼저")
        armorPersonalNotes.push("관심 지역 탐지 범위", "다리 부상 면역");
      // 사막 돌격대 / 적응력 → 모든 상태이상 피해 감소
      if (["사막 돌격대","적응력"].includes(armorPassive))
        armorPersonalNotes.push("모든 상태이상 피해 감소");
      // 굳건한 바위 → 레그돌 억제
      if (armorPassive === "굳건한 바위")
        armorPersonalNotes.push("레그돌 억제");
      // 보급 아드레날린 → 피해를 받을때 스태미나 회복
      if (armorPassive === "보급 아드레날린")
        armorPersonalNotes.push("피해를 받을때 스태미나 회복");
      // 추가 완충제 / 결연함 / 보급 아드레날린 → 받는 피해 감소
      if (["추가 완충제","결연함","보급 아드레날린"].includes(armorPassive))
        armorPersonalNotes.push("받는 피해 감소");
      // 강화된 견장 → 확률적 사지 부상 방지
      if (armorPassive === "강화된 견장")
        armorPersonalNotes.push("확률적 사지 부상 방지");
    }
    // 문자열을 pos kind 객체로 정규화
    const normalizedPersonalNotes = armorPersonalNotes.map(n =>
      typeof n === "string" ? { text: n, kind:"pos" } : n
    );

    return {
      uniqueTraits: [...new Set(allTraits)],
      wbSummary,
      roleTags,
      fireformGear,
      fireformStrat,
      hasIdealBody,
      armorPassive,
      armorPersonalNotes: normalizedPersonalNotes,
    };
  }, [selected]);

  const activeLoadoutName = useMemo(()=>{
    if (!activeLoadoutId) return null;
    return savedLoadouts.find(l=>l.id===activeLoadoutId)?.name??null;
  },[activeLoadoutId,savedLoadouts]);

  /* ── 피커 ── */
  function openPickerFor(slotKey,slotKind,pickedId) {
    setPicker({ open:true, slotKey, slotKind, typeKey:SLOT_TO_TYPE[slotKind]??slotKind, pickedId:pickedId??null });
  }
  function closePicker() { setPicker(p=>({...p,open:false})); }

  function applyPick(item) {
    const sk=picker.slotKey;
    if (sk.startsWith("stratagem:")) {
      const idx=Number(sk.split(":")[1]);
      setSelected(prev=>{
        const updated=[...prev.stratagem]; updated[idx]=item;
        let nextIdx=null;
        for (let i=0;i<4;i++) { if (!updated[i]) { nextIdx=i; break; } }
        if (nextIdx!==null) setPicker(p=>({...p,slotKey:`stratagem:${nextIdx}`,pickedId:null}));
        else setPicker(p=>({...p,open:false}));
        return {...prev,stratagem:updated};
      });
    } else {
      setSelected(prev=>({...prev,[sk]:item}));
      closePicker();
    }
  }

  function clearSlot(slotKey) {
    setSelected(prev=>{
      if (slotKey.startsWith("stratagem:")) {
        const idx=Number(slotKey.split(":")[1]);
        const next=[...prev.stratagem]; next[idx]=null;
        return {...prev,stratagem:next};
      }
      return {...prev,[slotKey]:null};
    });
  }

  function handlePreviewSlotClick(i) {
    setPicker(p=>({...p,slotKey:`stratagem:${i}`,pickedId:selected.stratagem[i]?.id??null}));
  }

  /* ── 저장/관리 ── */
  function handleSaveLoadout() {
    const n=savedLoadouts.filter(l=>!l.isDefault).length;
    setSaveModal({ open:true, name:`로드아웃 ${n+1}` });
  }
  function confirmSave() {
    const name=saveModal.name.trim()||`로드아웃 ${savedLoadouts.length}`;
    const entry={ id:Date.now(), name, selected, createdAt:new Date().toISOString() };
    const next=[...savedLoadouts,entry];
    setSavedLoadouts(next);
    setActiveLoadoutId(entry.id);
    persistList(next,entry.id);
    setSaveModal({ open:false, name:"" });
  }
  function handleLoadLoadout(entry) {
    setSelected(entry.selected);
    setActiveLoadoutId(entry.id);
    persistList(savedLoadouts,entry.id);
    setManageModal(false);
  }
  function requestDelete(id) { setDeleteConfirm(id); }
  function confirmDelete() {
    const next=savedLoadouts.filter(l=>l.id!==deleteConfirm);
    const newLast=activeLoadoutId===deleteConfirm?null:activeLoadoutId;
    if (activeLoadoutId===deleteConfirm) setActiveLoadoutId(null);
    setSavedLoadouts(next);
    persistList(next,newLast);
    setDeleteConfirm(null);
  }
  function cancelDelete() { setDeleteConfirm(null); }
  function handleResetSelected() { setSelected(EMPTY_SELECTED); setActiveLoadoutId(null); }

  function handleContextMenu(e) {
    e.preventDefault();
    // 열린 것 순서대로 닫기: 피커 → 튜토리얼 → 저장모달 → 관리모달 → 초기화확인 → 삭제확인
    if (picker.open)          { setPicker(p=>({...p,open:false})); return; }
    if (tutorialStep >= 0)    { setTutorialStep(-1); return; }
    if (saveModal.open)       { setSaveModal(p=>({...p,open:false})); return; }
    if (manageModal)          { setManageModal(false); return; }
    if (infoModal)            { setInfoModal(false); return; }
    if (resetConfirm)         { setResetConfirm(false); return; }
    if (deleteConfirm)        { setDeleteConfirm(null); return; }
  }

  function startEdit(l) {
    setEditingId(l.id);
    setEditingName(l.name);
  }
  function commitEdit(id) {
    const trimmed = editingName.trim();
    if (!trimmed) { setEditingId(null); return; }
    const next = savedLoadouts.map(l => l.id===id ? {...l, name:trimmed} : l);
    setSavedLoadouts(next);
    persistList(next, activeLoadoutId);
    setEditingId(null);
  }
  function cancelEdit() { setEditingId(null); }

  const pickerItems     = useMemo(()=>itemsByType.get(picker.typeKey)??[],[itemsByType,picker.typeKey]);
  const isStratagemPicker = picker.slotKey.startsWith("stratagem:");
  const pickerTitle = useMemo(()=>{
    if (!picker.typeKey) return "";
    if (isStratagemPicker) return `스트라타젬 선택 (#${activeSlotIndex+1})`;
    return `${TYPE_LABEL_KO[picker.slotKey]??picker.slotKey} 선택`;
  },[picker.typeKey,picker.slotKey,isStratagemPicker,activeSlotIndex]);
  const isWeaponPicker = WEAPON_SLOT_KINDS.has(picker.slotKind);
  const deleteTarget   = deleteConfirm?savedLoadouts.find(l=>l.id===deleteConfirm):null;

  return (
    <div className="appShell" onContextMenu={handleContextMenu}>
      {/* 상단 네비 — appWrap 바깥, 화면 전체 폭 */}
      <nav className="topNav">
        <div className="topNavInner">
          <div className="topNavTitle">SES 자기 결정의 전달자 <span className="topNavPatch">억압의 도구</span></div>
          <div className="topNavTabs">
            <button className="topNavTab infoBtn" type="button"
              onClick={()=>setInfoModal(true)}
            >운용자 정보</button>
            <button className="topNavTab tutorialBtn" type="button"
              onClick={()=>setTutorialStep(0)}
            >튜토리얼</button>
          </div>
        </div>
      </nav>

      <div className="appWrap">
        {err && <div className="errorBox">에러: {err}</div>}

        {/* ── 로딩 화면 ── */}
        {isLoading && !err && (
          <div className="loadingScreen">
            <div className="loadingText">아군 구축함의 좌표 수신중...</div>
          </div>
        )}

        {/* ── 개인 로드아웃 ── */}
        {!isLoading && <div className="pagePersonal">
            <div className="layout">

              {/* mainCol: 슬롯 영역 전체 — PNG 캡처 대상 */}
              <div className="mainCol" ref={captureRef}>
                <div className="sectionTitle sectionTitleStrat">스트라타젬</div>
                <div className="stratRow">
                  {[0,1,2,3].map(i=>{
                    const item=selected.stratagem[i];
                    const warnBackpack=hasBackpackWeaponSelected&&item!=null&&getSubType(item)===SUBTYPE_BACKPACK;
                    return (
                      <Slot key={i} kind="stratagem" def={{titleKo:`스트라타젬 ${i+1}`}}
                        picked={item}
                        isPickerActive={picker.open&&picker.slotKey===`stratagem:${i}`}
                        warnBackpack={warnBackpack}
                        onClick={()=>openPickerFor(`stratagem:${i}`,"stratagem",item?.id)}
                        onClear={()=>clearSlot(`stratagem:${i}`)}
                        clearMode="x"
                      />
                    );
                  })}
                </div>

                <div className="sectionTitle sectionTitleGear" style={{marginTop:18}}>개인 장비</div>
                <div className="gearLayout">
                  <Slot kind="armor" def={{titleKo:"방어구"}} picked={selected.armor}
                    onClick={()=>openPickerFor("armor","armor",selected.armor?.id)}
                    onClear={()=>clearSlot("armor")} clearMode="text" />
                  <Slot kind="primary" def={{titleKo:"주무기"}} picked={selected.primary}
                    onClick={()=>openPickerFor("primary","primary",selected.primary?.id)}
                    onClear={()=>clearSlot("primary")} clearMode="text" />
                  <div className="gearSideStack">
                    <Slot kind="secondary" def={{titleKo:"보조무기"}} picked={selected.secondary}
                      onClick={()=>openPickerFor("secondary","secondary",selected.secondary?.id)}
                      onClear={()=>clearSlot("secondary")} clearMode="text" hideName={true} />
                    <Slot kind="throwable" def={{titleKo:"투척무기"}} picked={selected.throwable}
                      onClick={()=>openPickerFor("throwable","throwable",selected.throwable?.id)}
                      onClear={()=>clearSlot("throwable")} clearMode="text" hideName={true} />
                  </div>
                </div>

                {/* 분석 패널 */}
                <div className="statsPanel">
                  <div className="statsPanelTitle">로드아웃 분석</div>
                  <div className="statsGrid statsGridAnalysis">

                    {/* 역할 분류 */}
                    <div className="statItem roleTagsSection">
                      <div className="statLabel">역할 분류</div>
                      <div className="statTraitList" style={{ marginTop:6, gap:8 }}>
                        {stats.roleTags.length > 0
                          ? stats.roleTags.map(tag => (
                              <span key={tag.label} className="statRoleBadge"
                                style={{ background:`${tag.color}1a`, borderColor:`${tag.color}88`, color:tag.color }}>
                                {tag.label}
                              </span>
                            ))
                          : <span className="statEmpty">미선택</span>
                        }
                      </div>
                    </div>

                    {/* 구성 시너지 — 개인장비 | 스트라타젬 2열 */}
                    <div className="statItem synergySectionItem">
                        <div className="statLabel">구성 시너지</div>
                        <div className="fireformGrid">

                          {/* 개인 장비 열 */}
                          <div className="fireformCol">
                            <div style={{ marginBottom:6 }}>
                              <span className="fireformGroupTitle">개인 장비</span>
                            </div>
                            {stats.fireformGear.length > 0
                              ? stats.fireformGear.map((row, i) => <FireformRow key={i} row={row} hasIdealBody={stats.hasIdealBody} />)
                              : <span className="statEmpty">미선택</span>
                            }
                            {/* 방어구 패시브 개인 효과 섹션 */}
                            {stats.armorPersonalNotes?.length > 0 && (
                              <>
                                <div style={{ height:1, background:"rgba(255,255,255,.08)", margin:"6px 0 4px" }} />
                                <div className="fireformColTitle" style={{ marginBottom:3 }}>개인</div>
                                {stats.armorPersonalNotes.map((n, i) => (
                                  <span key={i} style={{
                                    fontSize:12, fontWeight:700, opacity:.95, lineHeight:1.4,
                                    color: n.kind === "neg" ? "#f87171" : "#86efac",
                                  }}>
                                    {n.kind === "neg" ? `- ${n.text}` : `+ ${n.text}`}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>

                          <div className="fireformDivider" />

                          {/* 스트라타젬 열 */}
                          <div className="fireformCol">
                            <div style={{ marginBottom:6 }}>
                              <span className="fireformGroupTitle">스트라타젬</span>
                            </div>
                            {stats.fireformStrat.length > 0
                              ? stats.fireformStrat.map((row, i) => <FireformRow key={i} row={row} />)
                              : <span className="statEmpty">미선택</span>
                            }
                          </div>

                        </div>
                    </div>

                    {/* 로드아웃 구성 요구 사항 */}
                    <div className="statItem reqSection">
                      <div className="statLabel">로드아웃 구성 요구 사항</div>
                      <div className="statTraitList" style={{ marginTop:5 }}>
                        {stats.wbSummary.length > 0
                          ? stats.wbSummary.map(({ wb, page }) => {
                              const st = getWbBadgeStyle(wb);
                              return (
                                <span key={wb} className="statWbBadge"
                                  style={{
                                    color:      st.color,
                                    background: st.background,
                                    borderColor:st.borderColor,
                                    textShadow: st.textShadow ?? "none",
                                  }}>
                                  {page > 0 ? `${wb} ${page}페이지` : wb}
                                </span>
                              );
                            })
                          : <span className="statEmpty">채권 불필요</span>
                        }
                      </div>
                    </div>



                  </div>
                </div>
              </div>{/* /mainCol */}

              {/* sideCol: 현재 선택 + 버튼 */}
              <div className="sideCol">
                <SelectedPanel selected={selected} activeLoadoutName={activeLoadoutName} />

                <div className="sideActions">
                  <div className="loadoutMgmtBtns">
                    <button className="lBtn lBtnSave"       onClick={handleSaveLoadout}                         type="button">현재 로드아웃 저장</button>
                    <button className="lBtn lBtnManage"     onClick={()=>setManageModal(true)}                  type="button">저장된 로드아웃 관리</button>
                    <button className="lBtn lBtnExport"     onClick={()=>exportLoadoutPng(captureRef,selected)} type="button">로드아웃 내보내기</button>
                  </div>
                  <button className="lBtn lBtnResetDanger" onClick={()=>setResetConfirm(true)}                type="button">선택 사항 초기화</button>
                </div>
              </div>

            </div>{/* /layout */}
        </div>}

      </div>

      {/* ── 튜토리얼 오버레이 ── */}
      <TutorialOverlay
        step={tutorialStep}
        onNext={()=>setTutorialStep(s=>Math.min(s+1, TUTORIAL_STEPS.length-1))}
        onPrev={()=>setTutorialStep(s=>Math.max(s-1, 0))}
        onClose={()=>setTutorialStep(-1)}
      />

      {/* ── 운용자 정보 모달 ── */}
      {infoModal && (
        <div className="modalOverlay" onClick={()=>setInfoModal(false)}>
          <div className="infoModalCard" onClick={e=>e.stopPropagation()}>
            <div className="infoModalTitle">운용자 정보</div>
            <div className="infoModalBody">

              {/* 이미지 + 우측 섹션들 */}
              <div className="infoTopRow">
                <div className="infoCreatorImgWrap">
                  <div className="infoCreatorImgLabel">컨셉 및 UI 구조 설정<br/>프롬프트 작성</div>
                  <img src="/hgg.png" alt="Hell-GiGyeon" className="infoCreatorImg" />
                  <div className="infoCreatorName">Hell-GiGyeon</div>

                </div>

                <div className="infoTopDivider" />

                <div className="infoRightSections">
                  <div className="infoSection">
                    <div className="infoLabel">프로토타입 리소스 제작 및 전체 기능 구현</div>
                    <div className="infoValue">ChatGPT, Claude.AI</div>
                  </div>
                  <div className="infoSection">
                    <div className="infoLabel">스트라타젬 .svg 파일 출처</div>
                    <div className="infoValue">Nicolas Vigneux</div>
                    <a className="infoLink" href="https://github.com/nvigneux/Helldivers-2-Stratagems-icons-svg" target="_blank" rel="noreferrer">github.com/nvigneux/Helldivers-2-Stratagems-icons-svg</a>
                  </div>
                  <div className="infoSection">
                    <div className="infoLabel">무기 및 방어구 이미지 출처</div>
                    <div className="infoValue">헬다이버즈 위키</div>
                    <a className="infoLink" href="https://helldivers.wiki.gg/wiki/Helldivers_Wiki" target="_blank" rel="noreferrer">helldivers.wiki.gg</a>
                  </div>
                  <div className="infoSection">
                    <div className="infoLabel">버그 및 건의 사항</div>
                    <div className="infoValue infoPending">추후 업데이트 예정</div>
                  </div>
                </div>
              </div>

              <div className="infoDivider" />

              <div className="infoBuildRow">
                <span className="infoBuildLabel">빌드 버전</span>
                <span className="infoBuildValue">ver 26.03.09</span>
              </div>
              <div className="infoBuildRow">
                <span className="infoBuildLabel">빌드 기준 최신 업데이트</span>
                <span className="infoBuildValue">ver 01.006.003 " Machinery of Oppression " <span className="infoSub">(억압의 도구)</span></span>
              </div>

            </div>
            <button className="lBtn lBtnManage" type="button"
              onClick={()=>setInfoModal(false)}
              style={{alignSelf:"flex-end", marginTop:4}}>닫기</button>
          </div>
        </div>
      )}

      {/* ── 초기화 확인 모달 ── */}
      {resetConfirm && (
        <div className="modalOverlay" onClick={()=>setResetConfirm(false)}>
          <div className="saveModalCard" style={{gap:18}} onClick={e=>e.stopPropagation()}>
            <div className="saveModalTitle" style={{color:"#fca5a5"}}>선택 사항 초기화</div>
            <div style={{fontSize:14, color:"rgba(255,255,255,.70)", lineHeight:1.7}}>
              현재 구성된 모든 장비 선택이 초기화됩니다.<br/>계속하시겠습니까?
            </div>
            <div className="saveModalActions">
              <button className="lBtn lBtnResetDanger" type="button"
                onClick={()=>{ handleResetSelected(); setResetConfirm(false); }}
                style={{flex:1, justifyContent:"center", padding:"10px"}}>초기화</button>
              <button className="lBtn lBtnManage" type="button"
                onClick={()=>setResetConfirm(false)}
                style={{flex:1, justifyContent:"center", padding:"10px"}}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 저장 모달 ── */}
      {saveModal.open && (
        <div className="modalOverlay" onClick={()=>setSaveModal(p=>({...p,open:false}))}>
          <div className="saveModalCard" onClick={e=>e.stopPropagation()}>
            <div className="saveModalTitle">로드아웃 저장</div>
            <input className="saveModalInput" type="text" placeholder="로드아웃 이름 입력"
              value={saveModal.name}
              onChange={e=>setSaveModal(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter")confirmSave();if(e.key==="Escape")setSaveModal(p=>({...p,open:false}));}}
              autoFocus
            />
            <div className="saveModalActions">
              <button className="lBtn lBtnSave"  onClick={confirmSave} type="button">저장</button>
              <button className="lBtn lBtnReset" onClick={()=>setSaveModal(p=>({...p,open:false}))} type="button">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 관리 모달 ── */}
      {manageModal && (
        <div className="modalOverlay" onClick={()=>setManageModal(false)}>
          <div className="manageModalCard" onClick={e=>e.stopPropagation()}>
            <div className="manageModalHeader">
              <div className="manageModalTitle">저장된 로드아웃 관리</div>
              <button className="modalClose" onClick={()=>setManageModal(false)} type="button">닫기</button>
            </div>
            <div className="manageModalList">
              {savedLoadouts.length===0&&<div className="manageEmpty">저장된 로드아웃이 없습니다.</div>}
              {savedLoadouts.map(l=>{
                const isActive=l.id===activeLoadoutId;
                const isEditing=editingId===l.id;
                return (
                  <div key={l.id} className={`manageItem ${isActive?"manageItemActive":""}`}>
                    <div className="manageItemInfo">
                      {isEditing ? (
                        <div className="manageEditRow">
                          <input
                            className="manageEditInput"
                            value={editingName}
                            onChange={e=>setEditingName(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter") commitEdit(l.id); if(e.key==="Escape") cancelEdit(); }}
                            autoFocus
                          />
                          <button className="manageBtnConfirm" onClick={()=>commitEdit(l.id)} type="button">확인</button>
                          <button className="manageBtnCancel"  onClick={cancelEdit}            type="button">취소</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          {isActive&&<span className="manageActiveIndicator">▶</span>}
                          <span className="manageItemName">{l.name}</span>
                          {l.isDefault&&<span className="manageDefaultBadge">기본</span>}
                          {!l.isDefault&&(
                            <button className="manageBtnEdit" onClick={()=>startEdit(l)} type="button" title="이름 수정">✎</button>
                          )}
                        </div>
                      )}
                      {!isEditing&&l.createdAt&&<div className="manageItemDate">{new Date(l.createdAt).toLocaleDateString("ko-KR")}</div>}
                    </div>
                    {!isEditing&&(
                      <div className="manageItemActions">
                        <button className="manageBtnLoad" onClick={()=>handleLoadLoadout(l)} type="button">불러오기</button>
                        {!l.isDefault&&(
                          <button className="manageBtnDel" onClick={()=>requestDelete(l.id)} type="button">삭제</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 ── */}
      {deleteConfirm && (
        <div className="modalOverlay" onClick={cancelDelete}>
          <div className="confirmCard" onClick={e=>e.stopPropagation()}>
            <div className="confirmTitle">로드아웃 삭제</div>
            <div className="confirmDesc">
              <strong>{deleteTarget?.name}</strong> 로드아웃을 삭제하시겠습니까?<br/>
              이 작업은 되돌릴 수 없습니다.
            </div>
            <div className="confirmActions">
              <button className="lBtn lBtnDanger" onClick={confirmDelete} type="button">삭제</button>
              <button className="lBtn lBtnReset"  onClick={cancelDelete}  type="button">취소</button>
            </div>
          </div>
        </div>
      )}

      <PickerModal
        open={picker.open}
        typeKey={picker.typeKey}
        slotKind={picker.slotKind}
        isWeapon={isWeaponPicker}
        title={pickerTitle}
        items={pickerItems}
        pickedId={picker.pickedId}
        onPick={applyPick}
        onClose={closePicker}
        selectedStratagemIds={selectedStratagemIds}
        activeStratagemPickedId={picker.pickedId}
        stratagemSlots={selected.stratagem}
        activeSlotIndex={activeSlotIndex}
        onPreviewSlotClick={handlePreviewSlotClick}
      />
    </div>
  );
}
