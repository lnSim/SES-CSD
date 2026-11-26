import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import Slot from "./components/Slot";
import PickerModal, { WbOwnedPopup, getWbOptionsFromItems } from "./components/PickerModal";
import SelectedPanel from "./components/SelectedPanel";
import LoadoutRadarChart, { calcRadarLayers } from "./LoadoutRadarChart";
import { withAssetVersion, DEFAULT_ICON } from "./assetVersion";
import LoadoutBoard, { BoardPostModal } from "./components/LoadoutBoard";
import {
  normalizeIcon, RandIcon, FilterSelect,
  SUPPORT_WEAPON_SUBTYPES_ALL, getSupportWeaponInfo, getSupportClass, SUPPORT_CLASS_ORDER, sortWeaponTypes,
  LOADOUT_CODE_PREFIX, encodeLoadoutCode, decodeLoadoutCode, copyText,
  IconCopy, IconLoad, IconTrash, IconCheck,
  EMPTY_SLOT_LABEL, getWbBadgeStyle, computeWbSummary, hasAnyItem,
} from "./loadoutShared";

const DEPLOYMENT_ID = import.meta.env.VITE_GAS_DEPLOYMENT_ID;
const GAS_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;  // 게시판 조회/쓰기 (브라우저 직접 호출)

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

/* ── GAS 데이터 localStorage 캐시 ──
 * 탭을 닫아도 유지되어, 유효기간(GAS_CACHE_TTL_MS) 안에는 GAS를 다시 호출하지 않음
 * - GAS_CACHE_VERSION 변경 시 → 모든 사용자 캐시 즉시 무효화 (급한 DB 반영 시 사용)
 * - 유효기간 경과 시 → 다음 접속 때 새로 받음 (사소한 DB 수정은 최대 6시간 내 반영)
 * - 새로 받기 실패 시 → 만료된 캐시라도 있으면 그걸로 표시 (오류 화면 방지)
 */
const GAS_CACHE_VERSION = "v_권위의가늠자"; // WB_NOTICE_VERSION과 동기화
const GAS_CACHE_KEY     = `gas_cache_${GAS_CACHE_VERSION}`;
const GAS_CACHE_TTL_MS  = 6 * 60 * 60 * 1000; // 6시간
function gasCacheRead() {
  try {
    const r = localStorage.getItem(GAS_CACHE_KEY);
    if (!r) return null;
    const o = JSON.parse(r);
    return (o && typeof o === "object" && "data" in o) ? o : null;
  } catch { return null; }
}
function gasCacheGet() {
  const o = gasCacheRead();
  if (!o) return null;
  if (Date.now() - Number(o.savedAt || 0) > GAS_CACHE_TTL_MS) return null; // 만료
  return o.data;
}
function gasCacheGetStale() { return gasCacheRead()?.data ?? null; }
function gasCacheSet(data) {
  try {
    // 이전 버전 캐시 정리 (localStorage 용량 확보)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("gas_cache_") && k !== GAS_CACHE_KEY) localStorage.removeItem(k);
    }
    localStorage.setItem(GAS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
  try { sessionStorage.removeItem(GAS_CACHE_KEY); } catch {} // 구버전(sessionStorage) 캐시 정리
}

/* ── GAS 호출 ──
 * 1순위: GAS 직접 호출 (Vercel을 거치지 않음 → Vercel 요청/전송량 0)
 * 2순위: 직접 호출 실패 시에만 기존 /api 프록시(vercel.json rewrite)로 재시도
 */
async function fetchGasJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,120)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Not JSON: ${text.slice(0,120)}`); }
}
function fetchGasData() {
  const direct = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
  const proxy  = `/api/macros/s/${DEPLOYMENT_ID}/exec`;
  return fetchGasJson(direct).catch(e => {
    console.warn("[GAS] 직접 호출 실패 → /api 프록시로 재시도:", e);
    return fetchGasJson(proxy);
  });
}

/* ── 소지 전쟁 채권 (모든 선택창 공통) ──
 * 저장 형식: { owned:[채권명...] } — 키가 없으면 "아직 설정하지 않음"
 * 이전 버전(pickerFilters_v7:슬롯)의 슬롯별 소지 채권은 최초 1회 합집합으로 이전 */
const OWNED_WB_KEY = "ownedWarBonds_v1";
const LEGACY_PICKER_KEY_PREFIX = "pickerFilters_v7:";
const LEGACY_SLOT_TYPES = { stratagem:"stratagem", armor:"armor", primary:"주무기", secondary:"보조무기", throwable:"투척무기" };
function ownedWbLoad() {
  try {
    const r = localStorage.getItem(OWNED_WB_KEY);
    if (!r) return null;
    const o = JSON.parse(r);
    return Array.isArray(o?.owned) ? o.owned : null;
  } catch { return null; }
}
function ownedWbSave(set) { try { localStorage.setItem(OWNED_WB_KEY, JSON.stringify({ owned:[...set] })); } catch {} }
function hasLegacyPickerFilters() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (String(localStorage.key(i)).startsWith(LEGACY_PICKER_KEY_PREFIX)) return true;
    }
  } catch {}
  return false;
}
/* 슬롯별 이전 설정 → 합집합. 열어본 적 없는 슬롯은 이전 기본값(전체 소지)으로 간주 */
function migrateLegacyOwnedWb(items) {
  const owned = new Set();
  for (const [slot, type] of Object.entries(LEGACY_SLOT_TYPES)) {
    const opts = getWbOptionsFromItems(items.filter(it => it.type === type));
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LEGACY_PICKER_KEY_PREFIX + slot) || "null"); } catch {}
    const list = Array.isArray(saved?.ownedWb) ? saved.ownedWb.filter(w => opts.includes(w)) : opts;
    list.forEach(w => owned.add(w));
  }
  return owned;
}

/* ── 신규 채권 미리보기 오버레이 ── */
// ★ 채권 업데이트 시 WB_NOTICE_VERSION을 바꾸면 모든 사용자에게 재표시됨
const WB_NOTICE_VERSION = "v_권위의가늠자";
const WB_NOTICE_KEY     = `wb_notice_dismissed_${WB_NOTICE_VERSION}`;
function wbNoticeDismissed()  { try { return localStorage.getItem(WB_NOTICE_KEY) === "true"; } catch { return false; } }
function wbNoticeSetDismiss() { try { localStorage.setItem(WB_NOTICE_KEY, "true"); } catch {} }

// ★ 채권 업데이트 시 아래 데이터 수정
const WB_NOTICE_DATA = {
  name: "권위의 가늠자",
  // ★ 채권 업데이트 시 항목 수정
  // DB G열(wbrequirement) = '권위의 가늠자' 기준으로 각 시트에서 조회 후 추가
  items: [
    { label: "R-40 사이트라이너",      kind: "주무기",        id: "pr_sr_r40"    },
    { label: "P-44 미스트",            kind: "보조무기",      id: "se_ps_p44"    },
    { label: "G-11 마름쇠",            kind: "투척무기",      id: "th_sp_g11"    },
    { label: "SS-33 모방의 원수",      kind: "방어구",        id: "ar_ss_ss33"   },
    { label: "SS-15 포컬 포인트",      kind: "방어구",        id: "ar_ss_ss15"   },
    { label: "AMW-20 에이펙스",        kind: "지원배낭 무기", id: "st_sw_amw20"  },
    { label: "LAS-44 노바",            kind: "지원무기",      id: "st_sw_las44"  },
  ],
  // DB G열 = '슈퍼 스토어' + H열 = '권위의 가늠자 로테이션'
  superStore: [
    { label: "SS-500 창백한 검찰관",   kind: "방어구",        id: "ar_ss_ss500"  },
  ],
};

const KIND_COLOR = {
  "주무기":       { color:"#dfdfe1", shadow:"rgba(223,223,225,.55)", glow:"#fde047", glowShadow:"rgba(253,224,71,.55)" },
  "보조무기":     { color:"#dfdfe1", shadow:"rgba(223,223,225,.55)", glow:"#fde047", glowShadow:"rgba(253,224,71,.55)" },
  "투척무기":     { color:"#dfdfe1", shadow:"rgba(223,223,225,.55)", glow:"#fde047", glowShadow:"rgba(253,224,71,.55)" },
  "방어구":       { color:"#dfdfe1", shadow:"rgba(223,223,225,.55)", glow:"#fde047", glowShadow:"rgba(253,224,71,.55)" },
  "지원무기":     { color:"#bfe1f6", shadow:"rgba(191,225,246,.55)", glow:"#bfe1f6", glowShadow:"rgba(191,225,246,.55)" },
  "지원배낭 무기":{ color:"#bfe1f6", shadow:"rgba(191,225,246,.55)", glow:"#bfe1f6", glowShadow:"rgba(191,225,246,.55)" },
  "일회용 지원무기":{ color:"#bfe1f6", shadow:"rgba(191,225,246,.55)", glow:"#bfe1f6", glowShadow:"rgba(191,225,246,.55)" },
  "스트라타젬":   { color:"#dfdfe1", shadow:"rgba(223,223,225,.55)", glow:"#fde047", glowShadow:"rgba(253,224,71,.55)" },
  "슈퍼스토어":   { color:"#00f6ff", shadow:"rgba(0,246,255,.55)",   glow:"#00f6ff", glowShadow:"rgba(0,246,255,.55)"  },
};

function WbItemIcon({ src, alt }) {
  const [useDefault, setUseDefault] = useState(false); // 이미지 없음 → default.png로 대체
  const [dead, setDead] = useState(false);
  if (dead) return null;
  return (
    <img src={withAssetVersion(useDefault ? DEFAULT_ICON : src)} alt={alt}
      className="wbNoticeItemIcon" draggable={false} loading="lazy" decoding="async"
      onError={() => { if (!useDefault && src !== DEFAULT_ICON) setUseDefault(true); else setDead(true); }}
    />
  );
}

function WbNoticeOverlay({ onClose, isActivated=false, onActivate }) {
  const [fading, setFading] = useState(false);
  const handleClose = (permanent) => {
    if (permanent) wbNoticeSetDismiss();
    setFading(true);
    setTimeout(() => onClose(), 350);
  };


  function resolveWbIcon(id) {
    if (!id) return null;
    if (id.startsWith("ar_")) return `/icons/armor/${id}.png`;
    if (id.startsWith("st_")) {
      // .svg 파일 미준비 항목: .png 임시 사용
      return `/icons/stratagem/${id}.svg`;
    }
    return `/icons/weapon/${id}.png`;
  }

  /* kind → 표시 레이블 */
  const KIND_LABEL = {
    "주무기":          "주무기",
    "보조무기":        "보조무기",
    "투척무기":        "투척무기",
    "방어구":          "방어구",
    "공격":            "스트라타젬",
    "지원무기":        "스트라타젬",
    "지원배낭 무기":   "스트라타젬",
    "일회용 지원무기": "스트라타젬",
    "배낭":            "스트라타젬",
    "방어":            "스트라타젬",
    "스트라타젬":      "스트라타젬",
    "슈퍼스토어":      "슈퍼 스토어",
  };

  return (
    <div
      className={`wbNoticeOverlay ${fading ? "wbNoticeFading" : ""}`}
      onClick={() => handleClose(false)}
    >
      <div className="wbNoticeCard" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="wbNoticeHeader">
          <span className="wbNoticeTitle">신규 채권이 업데이트 되었습니다!</span>
        </div>

        {/* 채권 이미지 — 상단 전체 폭 */}
        <div className="wbNoticeImgWrap">
          <img src={`/latest_wb.webp?v=${encodeURIComponent(WB_NOTICE_VERSION)}`} alt="신규 채권 미리보기" className="wbNoticeImg"
            onError={e => { e.currentTarget.style.display = "none"; }} />
        </div>

        {/* 채권명 */}
        <div className="wbNoticeWbName" style={{ color:"#dedfb5", textShadow:"0 0 10px rgba(222,223,181,.70), 0 0 24px rgba(222,223,181,.35)" }}>{WB_NOTICE_DATA.name}</div>

        {/* 항목 카드 — 개인장비 → 스트라타젬 → 슈퍼스토어 순 */}
        <div className="wbNoticeScrollArea">

          {(() => {
            const STRAT_KINDS = new Set(["스트라타젬","공격","지원무기","지원배낭 무기","일회용 지원무기","배낭","방어","센트리"]);
            const allItems   = WB_NOTICE_DATA.items; // 개인장비 + 스트라타젬 모두
            const renderCard = (cs, iconSrc, label, kindLabel) => (
              <div key={label} className="wbNoticeItemCard"
                style={{ borderColor:`${cs.glow}44`, background:`${cs.glow}0a`, boxShadow:`0 0 8px ${cs.glowShadow}` }}>
                <div className="wbNoticeItemImgWrap">
                  {iconSrc ? <WbItemIcon src={iconSrc} alt={label} /> : <div className="wbNoticeItemImgPlaceholder" />}
                </div>
                <div className="wbNoticeItemName" style={{ color:cs.glow, textShadow:`0 0 8px ${cs.glowShadow}` }}>{label}</div>
                <div className="wbNoticeItemKind">{kindLabel}</div>
              </div>
            );
            return (
              <>
                {/* 채권 구성품 — 한 줄 */}
                {allItems.length > 0 && (
                  <>
                    <div className="wbNoticeSectionLabel" style={{ color:"rgba(253,224,71,.65)" }}>채권에 포함된 구성품</div>
                    <div className="wbNoticeItemGrid">
                      {allItems.map(({ label, kind, id }) => {
                        const cs = KIND_COLOR[kind] ?? KIND_COLOR["주무기"];
                        return renderCard(cs, resolveWbIcon(id), label, KIND_LABEL[kind] ?? kind);
                      })}
                    </div>
                  </>
                )}
                {/* 슈퍼 스토어 행 */}
                {WB_NOTICE_DATA.superStore?.length > 0 && (
                  <>
                    <div className="wbNoticeSectionLabel" style={{ color:"#00f6ff", textShadow:"0 0 8px rgba(0,246,255,.55)" }}>슈퍼스토어 로테이션 추가</div>
                    <div className="wbNoticeItemGrid">
                      {WB_NOTICE_DATA.superStore.map(({ label, kind, id }) => {
                        const cs = KIND_COLOR["슈퍼스토어"];
                        return renderCard(cs, resolveWbIcon(id), label, KIND_LABEL[kind] ?? kind);
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}

        </div>

        {/* 하단 */}
        <div className="wbNoticeActions">
          <button type="button" className="wbNoticeActivateBtn"
            disabled={isActivated} onClick={() => onActivate?.()}>
            {isActivated ? "해당 채권 활성화됨 ✓" : "해당 채권 활성화"}
          </button>
          <button type="button" className="wbNoticePermanentBtn" onClick={() => handleClose(true)}>
            채권 업데이트 전까지 해당 창을 표시하지 않기
          </button>
          {/* 모바일: 닫기 버튼 / PC: 힌트 텍스트 */}
          <button type="button" className="wbNoticeCloseBtn" onClick={() => handleClose(false)}>
            닫기
          </button>
          <div className="wbNoticeHint">아무곳이나 클릭하면 이 창을 닫습니다.</div>
        </div>

      </div>
    </div>
  );
}

/* ── 기본 제공 로드아웃 아이템 ID (실제 DB 기준) ── */
const DEFAULT_LOADOUT_IDS = {
  stratagem: ["st_orb_ps", "st_sw_mg43", null, null],  // 궤도 정밀 타격, MG-43 기관총
  armor:     "ar_ep_b01",    // B-01 전술
  primary:   "pr_ar_ar23",   // AR-23 리버레이터
  secondary: "se_ps_p2",     // P-2 피스메이커
  throwable: "th_gr_g12",    // G-12 고폭
};

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
const PEN_LABEL_PNG = { "2":"경장갑 관통","3":"일반 장갑 관통","4":"중장갑 관통","5":"대전차 1","6":"대전차 2","7":"대전차 3","8":"대전차 4","9":"대전차 5","10":"대전차 6" };
const PEN_BG_PNG    = { "2":"#565656","3":"#cd8527","4":"#cd8527","5":"#8a080d","6":"#8a080d","7":"#6b0c0f","8":"#6b0c0f","9":"#1a1a1a","10":"#1a1a1a" };
const TRAIT_BG_PNG  = {
  "소이":"#ffcfc9","폭발성":"#ffc8aa","레이저":"#ffe5a0","플라즈마":"#e6cff2",
  "아크":"#0a53a8","가스":"#d4edbc","기절":"#d4edbc","치유":"#d4edbc",
  /* 밝은 배경 태그 */
  "방어막":"#d0eeff",
  "유도":"#f0f0f0",
  "한 손 파지":"#e8e8e8","단발 장전":"#e8e8e8","탄종/발사형식 변경":"#e8e8e8",
  "차지 업":"#e8e8e8","과열":"#e8e8e8","총검":"#e8e8e8","소음기":"#e8e8e8",
};
const TRAIT_TC_PNG  = {
  "아크":"#fff",
  /* 밝은 배경 → 어두운 텍스트 */
  "방어막":"#1a5080",
  "유도":"#1a1a1a",
  "한 손 파지":"#1a1a1a","단발 장전":"#1a1a1a","탄종/발사형식 변경":"#1a1a1a",
  "차지 업":"#1a1a1a","과열":"#1a1a1a","총검":"#1a1a1a","소음기":"#1a1a1a",
};

/* URL의 확장자를 교체해 fallback 목록 생성 */
/* sheet 기반 단일 확장자 결정 (PNG 내보내기 canvas용) */
function resolveIconUrl(url, sheet) {
  if (!url) return null;
  const base = window.location.origin;
  const abs  = url.startsWith("http") ? url : base + (url.startsWith("/") ? url : "/" + url);
  const ext  = String(sheet || "").toLowerCase() === "stratagem" ? ".svg" : ".png";
  return abs.replace(/\.(png|svg|webp)$/i, ext);
}

/* 이미지 단일 URL 로드 — 실패 시 default.png로 1회 대체 */
function loadImgOnce(src) {
  return new Promise(res => {
    const el = new Image();
    if (!/\.svg(\?|$)/i.test(src)) el.crossOrigin = "anonymous";
    el.onload  = () => res(el);
    el.onerror = () => res(null);
    el.src = src;
  });
}
async function loadImgWithFallback(url, sheet, itemId) {
  const resolved = resolveIconUrl(url, sheet);
  if (!resolved) return null;
  const img = await loadImgOnce(withAssetVersion(resolved));
  if (img) return img;
  return await loadImgOnce(withAssetVersion(window.location.origin + DEFAULT_ICON));
}

function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

async function exportLoadoutPng(captureRef, selected, wbSummary=[]) {
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
  const SEL_W=270;
  const TOTAL_W=PAD+LEFT_W+GAP+SEL_W+PAD;

  /* ── 높이 계산 ── */
  const TITLE_H=18, SEC_GAP=20;
  // 로드아웃 행들
  const STRAT_BLOCK = TITLE_H+6+STRAT_SZ;
  const GEAR_BLOCK  = TITLE_H+6+ARM_H;
  // 로드아웃 구성 요구 사항 영역 — 항상 표시
  const WB_PILL_H = 19, WB_GAP = 5;
  const wbRows = Math.max(1, wbSummary.length > 0 ? Math.ceil(wbSummary.length / 5) : 1);
  const WB_BLOCK = SEC_GAP + 14 + 10 + wbRows * (WB_PILL_H + WB_GAP) + 14;
  const LEFT_H = STRAT_BLOCK + SEC_GAP + GEAR_BLOCK + WB_BLOCK;

  // 현재선택 패널 높이 — LEFT_H + 하단 여유 추가
  const SEL_ROW_H=36;
  const SEL_H_MIN = 24 + 4 + (4*(SEL_ROW_H+8)) + 14 + 14 + 4 + (4*(SEL_ROW_H+16));
  // 패널은 LEFT_H 기준 + 하단 여유 30px
  const SEL_PANEL_H = Math.max(LEFT_H, SEL_H_MIN) + 30;

  const TOTAL_H = PAD + SEL_PANEL_H + PAD;

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
    Promise.all(selected.stratagem.map(it => loadImgWithFallback(it?.icon, it?.sheet, it?.id))),
    loadImgWithFallback(selected.armor?.icon,      selected.armor?.sheet,     selected.armor?.id),
    loadImgWithFallback(selected.primary?.icon,    selected.primary?.sheet,   selected.primary?.id),
    loadImgWithFallback(selected.secondary?.icon,  selected.secondary?.sheet, selected.secondary?.id),
    loadImgWithFallback(selected.throwable?.icon,  selected.throwable?.sheet, selected.throwable?.id),
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
      ctx.fillText(EMPTY_SLOT_LABEL,sx+STRAT_SZ/2,sy+STRAT_SZ/2); ctx.textAlign="left";
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
    ctx.fillText(EMPTY_SLOT_LABEL,AX+ARM_W/2,AY+ARM_H/2); ctx.textAlign="left";
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
    ctx.fillText(EMPTY_SLOT_LABEL,PX+PRI_W/2,PY+PRI_H/2); ctx.textAlign="left";
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
      ctx.fillText(EMPTY_SLOT_LABEL,SX+SIDE_W/2,sy2+SIDE_H/2); ctx.textAlign="left";
    }
  }

  /* ── 3. 로드아웃 구성 요구 사항 (개인장비 하단) — 항상 표시 ── */
  {
    const WB_Y_START = gearY + ARM_H + SEC_GAP;
    const WB_BOX_PAD = 14;
    const WB_PILL_H_INNER = 19, WB_GAP_X = 6, WB_GAP_Y = 5;
    const innerRows = Math.max(1, wbSummary.length > 0 ? Math.ceil(wbSummary.length / 5) : 1);
    const WB_BOX_H = WB_BOX_PAD + 14 + 10 + innerRows * (WB_PILL_H_INNER + WB_GAP_Y) + WB_BOX_PAD;

    // 박스 배경
    ctx.fillStyle = "rgba(22,22,22,0.95)";
    rRect(ctx, LX, WB_Y_START, LEFT_W, WB_BOX_H, 12); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
    rRect(ctx, LX, WB_Y_START, LEFT_W, WB_BOX_H, 12); ctx.stroke();

    // 타이틀
    ctx.fillStyle="#f0c400"; ctx.font=`800 12px ${FONT}`;
    ctx.textBaseline="middle"; ctx.textAlign="left";
    ctx.fillText("로드아웃 구성 요구 사항", LX + WB_BOX_PAD, WB_Y_START + WB_BOX_PAD + 7);

    let wbCy = WB_Y_START + WB_BOX_PAD + 14 + 8;
    let wbX = LX + WB_BOX_PAD;

    if (wbSummary.length === 0) {
      // 채권 불필요 텍스트
      ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.font=`700 10px ${FONT}`;
      ctx.textBaseline="middle"; ctx.textAlign="left";
      ctx.fillText("채권 불필요", wbX, wbCy + WB_PILL_H_INNER/2);
    } else {
      const PNG_WB_STYLES = {
        "헬다이버 출동!":          { bg:"#0e2c2e", border:"rgba(247,243,82,.35)", tc:"#f7f352" },
        "결연한 베테랑":           { bg:"#ea630f", border:"rgba(255,255,255,.3)",  tc:"#ffffff" },
        "최첨단":                  { bg:"#0044ab", border:"rgba(96,216,255,.50)",  tc:"#ffffff" },
        "민주적 폭파":             { bg:"#920f00", border:"rgba(239,143,0,.35)",   tc:"#ef8f00", glow:"#680800" },
        "극지의 애국자":           { bg:"#3eb0e8", border:"rgba(255,255,255,.3)",  tc:"#ffffff", glow:"#2c7fbf" },
        "독사 특공대":             { bg:"#103318", border:"rgba(255,255,255,.2)",  tc:"#ffffff" },
        "자유의 불꽃":             { bg:"#562f18", border:"rgba(255,121,24,.35)",  tc:"#ff7918" },
        "화학 요원":               { bg:"#3c4209", border:"rgba(211,236,24,.3)",   tc:"#d3ec18" },
        "진리의 집행자":           { bg:"#dcc9c9", border:"rgba(181,0,0,.4)",      tc:"#b50000" },
        "도시 전설":               { bg:"#3c4548", border:"rgba(206,174,0,.35)",   tc:"#ceae00" },
        "자유의 종복":             { bg:"#180000", border:"rgba(255,255,255,.2)",  tc:"#ffffff" },
        "정의의 경계선":           { bg:"#422d21", border:"rgba(221,218,221,.25)", tc:"#dddadd" },
        "의장의 달인":             { bg:"#ffffff", border:"#efdf94",               tc:"#105994" },
        "법의 위력":               { bg:"#1e1831", border:"#d64566",               tc:"#ffffff" },
        "대조군":                  { bg:"#d4d2d1", border:"rgba(21,53,78,.3)",     tc:"#15354e" },
        "먼지 폭풍":               { bg:"#301807", border:"rgba(239,215,168,.3)",  tc:"#efd7a8" },
        "금사 특공대":             { bg:"#1b1b0b", border:"rgba(186,224,178,.3)",  tc:"#bae0b2" },
        "존재하지 않는 부대":      { bg:"#08191c", border:"rgba(251,128,128,.35)", tc:"#fb8080" },
        "공성 파괴자":             { bg:"#2a292a", border:"rgba(241,212,96,.35)",  tc:"#f1d460" },
        "민주적 궤도 강하 타격대": { bg:"#081c28", border:"#fbfbaa",               tc:"#ffffff" },
        "정의로운 망령":           { bg:"#1e1d1b", border:"#fbee6b",               tc:"#ffffff" },
        "슈퍼시민권 업그레이드":   { bg:"#000000", border:"#fee800",               tc:"#fee800" },
        "해방절 보상":             { bg:"#0a1c2c", border:"#2071aa",               tc:"#b0deef" },
        "슈퍼스토어 구매":         { bg:"#001c2e", border:"rgba(0,246,255,.65)",   tc:"#00f6ff" },
        "견고한 참호 사단":        { bg:"#040200", border:"#978642",               tc:"#c7b243" },
        "외계 전문가":             { bg:"#fffbe5", border:"#c4a882",               tc:"#654632" },
        "카스텔란의 신조":         { bg:"#2c4658", border:"#f50301",               tc:"#dfdfe1" },
        "철갑의 민주주의":         { bg:"#41494f", border:"#262b31",               tc:"#dddac2" },
        "권위의 가늠자":           { bg:"#0e200e", border:"#4a5a32",               tc:"#dedfb5", hatch:"#4a5a32" },
      };
      const fallbackColors = ["#f7f352","#fb923c","#f87171","#c084fc","#60a5fa","#34d399"];
      let fbIdx = 0;

      for (const { wb, page } of wbSummary) {
        const label = page > 0 ? `${wb} ${page}페이지` : wb;
        const sty = PNG_WB_STYLES[wb];
        let bg, border, tc;
        if (sty) { ({ bg, border, tc } = sty); }
        else { const c = fallbackColors[fbIdx++ % fallbackColors.length]; bg = c+"22"; border = c+"88"; tc = c; }

        ctx.font = `700 9px ${FONT}`;
        const tw = ctx.measureText(label).width;
        const pw = tw + 14;
        if (wbX + pw > LX + LEFT_W - WB_BOX_PAD && wbX > LX + WB_BOX_PAD) {
          wbX = LX + WB_BOX_PAD; wbCy += WB_PILL_H_INNER + WB_GAP_Y;
        }
        ctx.fillStyle = bg;
        rRect(ctx, wbX, wbCy, pw, WB_PILL_H_INNER, 8); ctx.fill();
        if (sty?.hatch) {
          // 빗금 효과 (권위의 가늠자 등)
          ctx.save();
          rRect(ctx, wbX, wbCy, pw, WB_PILL_H_INNER, 8); ctx.clip();
          ctx.strokeStyle = sty.hatch; ctx.lineWidth = 2;
          for (let hx = wbX - WB_PILL_H_INNER; hx < wbX + pw; hx += 8) {
            ctx.beginPath();
            ctx.moveTo(hx, wbCy + WB_PILL_H_INNER);
            ctx.lineTo(hx + WB_PILL_H_INNER, wbCy);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.strokeStyle = border; ctx.lineWidth = 1;
        rRect(ctx, wbX, wbCy, pw, WB_PILL_H_INNER, 8); ctx.stroke();
        ctx.fillStyle = tc; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        if (sty?.glow) {
          // 텍스트 가시성용 글로우 (민주적 폭파 / 극지의 애국자)
          ctx.save();
          ctx.shadowColor = sty.glow; ctx.shadowBlur = 6;
          ctx.fillText(label, wbX + 7, wbCy + WB_PILL_H_INNER / 2);
          ctx.shadowBlur = 2;
          ctx.fillText(label, wbX + 7, wbCy + WB_PILL_H_INNER / 2);
          ctx.restore();
        } else {
          ctx.fillText(label, wbX + 7, wbCy + WB_PILL_H_INNER / 2);
        }
        wbX += pw + WB_GAP_X;
      }
    }
  }

  /* ══════════════════════════════════════════
     우측: 현재 선택 패널
  ══════════════════════════════════════════ */
  const RX=PAD+LEFT_W+GAP;
  const RY=PAD;

  // 패널 배경
  ctx.fillStyle="rgba(22,22,22,0.95)";
  rRect(ctx,RX,RY,SEL_W,SEL_PANEL_H,14); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.08)"; ctx.lineWidth=1;
  rRect(ctx,RX,RY,SEL_W,SEL_PANEL_H,14); ctx.stroke();

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
    ellipsisText(name||EMPTY_SLOT_LABEL, RX+RP+28, y2, SEL_W-RP*2-28);
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
    ellipsisText(it?.name_ko||EMPTY_SLOT_LABEL, RX+RP+44, ry, SEL_W-RP*2-44);
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

  /* 워터마크 — 현재 선택 패널 내부 하단 우측 정렬 */
  ctx.fillStyle="#f0c400"; ctx.font=`700 10px ${FONT}`;
  ctx.textBaseline="bottom"; ctx.textAlign="right";
  ctx.fillText("SES 자기 결정의 전달자", RX+SEL_W-RP, RY+SEL_PANEL_H-8);

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
    desc:  "이곳에서 현재 자신이 선택한 장비와 스트라타젬을 확인 가능하다. 태그를 클릭/터치하면 태그가 무엇을 의미하는지 설명을 보는 것이 가능하다. 참고해라!",
    area:  "selectedPanel",
  },
  {
    title: "로드아웃 분석",
    desc:  "자네의 장비 구성에 대한 평가를 이곳에서 분석한다. 어떤 부분이 부족한지 파악하도록!",
    area:  "radarChartSection",
  },
  {
    title: "권장 수치",
    desc:  "적의 세력은 다양하다! 적들을 상대하는데 어떤 능력을 필요로 하는지 확인해라!",
    area:  "tutorialReqSection",
  },
  {
    title: "교전 범위",
    desc:  "현재 무장의 조작성과 타격 가능 부위를 이곳에 표시한다. 구성에 따라 시너지를 발휘하는 경우도 있으니 적절한 조합을 찾아보도록!",
    area:  "tutorialRangeSection",
  },
  {
    title: "구성 요구 사항",
    desc:  "이곳에서 장비 구성을 위해 필요한 전쟁 채권을 확인 가능하다!",
    area:  "reqSection",
  },
  {
    title: "로드아웃 관리 기능",
    desc:  "이곳에서 자네가 구성한 장비 구성을 저장하고 불러올 수 있다! 제군의 민주주의를 전파하는 방식을 동료 헬다이버에게 공유하는 것도 가능하다!",
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
  const isMobileTut  = typeof window !== "undefined" && window.innerWidth <= 700;

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
          {isMobileTut && (
            <button type="button" onClick={onClose} style={{
              marginRight:"auto", padding:"7px 16px", borderRadius:999,
              border:"1px solid rgba(255,255,255,.18)", background:"transparent",
              color:"rgba(255,255,255,.55)", fontWeight:700, fontSize:12, cursor:"pointer",
            }}>닫기</button>
          )}
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
        {/* 하단 안내 (PC) — 모바일은 닫기 버튼 사용 */}
        {!isMobileTut && (
          <div style={{ fontSize:11, color:"rgba(255,255,255,.28)", textAlign:"center", marginTop:2 }}>
            창 밖 영역을 클릭해 튜토리얼을 바로 종료할 수 있습니다.
          </div>
        )}
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

  // passiveNotes(pos/pos2) → subNotes(pos2) → subNotes(pos) → subNotes(neg) 순으로 표시
  const allPos2 = [...passiveNotes.filter(n => n.kind === "pos2"), ...subNotes.filter(n => n.kind === "pos2")];
  const allPos  = [...passiveNotes.filter(n => n.kind === "pos"),  ...subNotes.filter(n => n.kind === "pos")];
  const allNeg  = subNotes.filter(n => n.kind === "neg");
  const orderedNotes = [...allPos2, ...allPos, ...allNeg];

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
      {/* 명칭 + 배지 + 노트 */}
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:3 }}>
        <span style={{ fontSize:13, color:nameColor, fontWeight:600, wordBreak:"keep-all", overflowWrap:"break-word" }}>{row.name}</span>
        {/* 배지 행 */}
        {(f || ergoStyle || respStyle) && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:1 }}>
            {f && <span className="statFireformBadge" style={{ ...fStyle, margin:0 }}>{f}</span>}
            {respStyle && <span className="statFireformBadge" style={{ background:respStyle.bg, border:`1px solid ${respStyle.border}`, color:respStyle.color, margin:0 }}>{respStyle.label}</span>}
            {!respStyle && ergoStyle && <span className="statFireformBadge" style={{ ...ergoStyle, margin:0 }}>{ERGO_LABEL[ergo] ?? ergo}</span>}
          </div>
        )}
        {/* 노트 (배지 아래) */}
        {orderedNotes.map((n,i) => (
          <span key={i} style={{ fontSize:12, fontWeight:700, opacity:.95,
            color: n.kind === "neg" ? "#f87171" : n.kind === "pos2" ? "#4ade80" : "#86efac" }}>
            {n.kind === "neg" ? `- ${n.text}` : n.kind === "pos2" ? `${n.text}` : `+ ${n.text}`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [tutorialStep,   setTutorialStep]   = useState(-1); // -1=숨김, 0~N=진행중
  const [showBetaNotice, setShowBetaNotice] = useState(false);
  // 최초 접속 여부: 소지 채권 설정도, 이전 버전 필터 기록도 없음 → 소지 채권 선택 팝업 1회
  const isFirstVisitRef = useRef(null);
  if (isFirstVisitRef.current === null) isFirstVisitRef.current = ownedWbLoad() === null && !hasLegacyPickerFilters();
  // 최초 접속자는 소지 채권 선택 팝업에서 직접 고르므로 같은 버전의 신규 채권 알림은 생략
  const [showWbNotice, setShowWbNotice] = useState(() => !isFirstVisitRef.current && !wbNoticeDismissed());
  const [ownedWb, setOwnedWbState] = useState(() => { const a = ownedWbLoad(); return a ? new Set(a) : null; });
  const [wbOwnedPopup, setWbOwnedPopup] = useState(null); // null | "first" | "edit"
  function setOwnedWb(next) { setOwnedWbState(next); ownedWbSave(next); }

  const [activePage,   setActivePage]   = useState("loadout"); // "loadout" | "random"
  const [sideMenuOpen, setSideMenuOpen] = useState(false);     // 모바일 사이드 메뉴
  // 신규 기능 안내: 로드아웃 게시판을 한 번 방문하기 전까지 New 표시 + 글로우
  const [boardVisited, setBoardVisited] = useState(() => { try { return localStorage.getItem("board_visited_v1") === "1"; } catch { return true; } });
  useEffect(() => {
    if (activePage === "board" && !boardVisited) {
      setBoardVisited(true);
      try { localStorage.setItem("board_visited_v1", "1"); } catch {}
    }
  }, [activePage, boardVisited]);
  const [heroPopup,    setHeroPopup]    = useState(false);   // 무작위 페이지 전환 시 팝업
  const [heroPopupFading, setHeroPopupFading] = useState(false); // 팝업 fade-out 중
  const [jokerFlash,   setJokerFlash]   = useState(null);    // 조커 교체 후 flash 대상 슬롯 key

  const closeHeroPopup = () => {
    setHeroPopupFading(true);
    setTimeout(() => { setHeroPopup(false); setHeroPopupFading(false); }, 400);
  };

  const goRandom = () => {
    setActivePage("random");
    setHeroPopup(true);
    setHeroPopupFading(false);
  };
  const [items,        setItems]        = useState([]);
  const [structures,   setStructures]   = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [flyingEnemies,setFlyingEnemies]= useState([]);
  const [tagInfo,      setTagInfo]      = useState([]);
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
  const [draggingLoadoutId, setDraggingLoadoutId] = useState(null); // 드래그 중인 로드아웃 id (관리 모달 순서 변경)
  const [editingName,     setEditingName]     = useState("");

  /* PNG 캡처 대상: mainCol 전체 */
  const captureRef = useRef(null);

  /* ── 무작위 로드아웃 ── */
  // 대전차 지원무기 id 목록 (armorPen >= 6 + 부분적 대전차)
  const AT_SUPPORT_WEAPON_IDS = new Set([
    "st_sw_eat17","st_sw_gr8","st_sw_arc3","st_sw_mls4x","st_sw_las99",
    "st_sw_faf14","st_sw_stax3","st_sw_eat700","st_sw_ms11","st_sw_c4",
    "st_sw_cqc20","st_sw_eat411","st_bp_b100","st_bp_ax9",
  ]);
  const RANDOM_STRAT_EXCLUDE_SUBTYPES = new Set(["탑승물"]);
  // 전채권 포함 wb 목록 (기본 + 무료 제공)
  const FREE_WB = new Set(["기본 제공","기본","헬다이버 출동!"]);

  const [randomResult,   setRandomResult]   = useState(null);
  const [resultMode,     setResultMode]     = useState("default"); // 결과가 생성된 시점의 모드
  const [randomPending,  setRandomPending]  = useState(false);
  const [randomMode,     setRandomMode]     = useState("default"); // 선택 옵션
  // 조커: 재선택 대상 슬롯 ("strat0"~"strat3","armor","primary","secondary","throwable")
  const [jokerTarget,    setJokerTarget]    = useState(null);
  const [jokerUsed,      setJokerUsed]      = useState(false); // 조커 교체 1회 사용 여부

  const pickRandom = () => {
    if (randomPending) return;
    setRandomPending(true);
    setJokerTarget(null);
    setJokerUsed(false);
    setTimeout(() => {
      const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
      const pick1 = (pool) => pool[Math.floor(Math.random() * pool.length)] ?? null;

      let stratPool = (itemsByType.get("stratagem") ?? [])
        .filter(it => !RANDOM_STRAT_EXCLUDE_SUBTYPES.has(getSubType(it)));

      // ── 옵션별 필터 ──
      // 헬다이버즈 2 클래식: 채권 구성품 제외 (기본 제공만)
      if (randomMode === "classic") {
        stratPool = stratPool.filter(it => FREE_WB.has(s(it?.wbrequirement)) || !it?.wbrequirement);
      }
      // 대전차 고갈: armorPen >= 6 지원무기 + 부분적 대전차 제외
      if (randomMode === "noat") {
        stratPool = stratPool.filter(it => !AT_SUPPORT_WEAPON_IDS.has(s(it?.id)));
      }

      let slots = 4;
      // "그 시절을 기억하나?" : 슬롯 3개만 사용
      if (randomMode === "olddays") slots = 3;

      let strats;
      if (randomMode === "chaos") {
        // 대혼돈: 배낭 중복 허용 — 완전 무작위
        strats = shuffle(stratPool).slice(0, slots);
      } else if (randomMode === "obsession") {
        // 집착: 한 stratType(공격/지원/방어)만
        const types = ["공격","지원","방어"];
        const chosen = types[Math.floor(Math.random() * types.length)];
        const typed = stratPool.filter(it => s(it?.stratType) === chosen);
        const shuffledTyped = shuffle(typed);
        strats = shuffledTyped.slice(0, slots);
        strats._obsessionType = chosen;
      } else {
        // 기본 (배낭 중복 불가)
        const shuffled = shuffle(stratPool);
        strats = [];
        const usedBp = new Set();
        for (const it of shuffled) {
          if (strats.length >= slots) break;
          const sub = getSubType(it);
          const isBp = sub === "배낭" || sub === "지원배낭 무기";
          if (isBp) {
            if (usedBp.has(sub + "_" + s(it?.id))) continue;
            // 배낭은 1개 제한
            const alreadyHasBp = strats.some(x => {
              const xs = getSubType(x);
              return xs === "배낭" || xs === "지원배낭 무기";
            });
            if (alreadyHasBp) continue;
          }
          strats.push(it);
        }
        // 부족하면 남은 것으로 채움
        if (strats.length < slots) {
          for (const it of shuffled) {
            if (strats.length >= slots) break;
            if (!strats.includes(it)) strats.push(it);
          }
        }
      }
      // olddays: 나머지 1슬롯은 null
      while (strats.length < 4) strats.push(null);

      const gearPool = (type) => {
        let pool = itemsByType.get(type) ?? [];
        if (randomMode === "classic") {
          pool = pool.filter(it => FREE_WB.has(s(it?.wbrequirement)) || !it?.wbrequirement);
        }
        return pool;
      };

      const result = {
        strats,
        obsessionType: strats._obsessionType ?? null,
        armor:     pick1(gearPool("armor")),
        primary:   pick1(gearPool("주무기")),
        secondary: pick1(gearPool("보조무기")),
        throwable: pick1(gearPool("투척무기")),
      };

      // 조커: 결과를 받은 뒤 하나를 재선택할 수 있도록 저장
      setRandomResult(result);
      setResultMode(randomMode);
      setRandomPending(false);
    }, 1200);
  };

  // 조커 재선택
  const jokerReroll = (target) => {
    if (!randomResult) return;
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const pick1 = (pool) => pool[Math.floor(Math.random() * pool.length)] ?? null;
    const newResult = { ...randomResult };
    if (target.startsWith("strat")) {
      const idx = parseInt(target.replace("strat",""));
      let stratPool = (itemsByType.get("stratagem") ?? [])
        .filter(it => !RANDOM_STRAT_EXCLUDE_SUBTYPES.has(getSubType(it)));
      if (randomMode === "noat") stratPool = stratPool.filter(it => !AT_SUPPORT_WEAPON_IDS.has(s(it?.id)));
      const others = newResult.strats.filter((_, i) => i !== idx);
      const avail  = shuffle(stratPool.filter(it => !others.includes(it)));
      newResult.strats = [...newResult.strats];
      newResult.strats[idx] = avail[0] ?? null;
    } else {
      const typeMap = { armor:"armor", primary:"주무기", secondary:"보조무기", throwable:"투척무기" };
      const pool = itemsByType.get(typeMap[target]) ?? [];
      newResult[target] = pick1(pool);
    }
    setRandomResult(newResult);
    setJokerTarget(null);
    setJokerUsed(true);
    // 교체된 슬롯 flash 효과
    setJokerFlash(target);
    setTimeout(() => setJokerFlash(null), 700);
  };

  /* ── 아이템 로드 & 기본 프리셋 자동 적용 ── */
  useEffect(() => {
    if (!DEPLOYMENT_ID) {
      setErr("VITE_GAS_DEPLOYMENT_ID 가 설정되지 않았습니다 (.env.local 확인)");
      return;
    }

    function applyData(d) {
      setErr("");
      const loaded=(Array.isArray(d?.items)?d.items:[]).map(normalizeItem);
      setItems(loaded);
      setStructures(Array.isArray(d?.structures)      ? d.structures      : []);
      setRequirements(Array.isArray(d?.requirements)  ? d.requirements    : []);
      setFlyingEnemies(Array.isArray(d?.flyingEnemies)? d.flyingEnemies   : []);
      setTagInfo(Array.isArray(d?.tagInfo)            ? d.tagInfo         : []);
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

      /* 새로고침 시 항상 기본 제공 로드아웃으로 시작 */
      setSelected({
        stratagem:[...defSel.stratagem],
        armor:    defSel.armor,
        primary:  defSel.primary,
        secondary:defSel.secondary,
        throwable:defSel.throwable,
      });
      setActiveLoadoutId("__default__");
    }

    // localStorage 캐시(유효기간 내) 확인 → 있으면 즉시 적용 후 종료
    const cached = gasCacheGet();
    if (cached) {
      applyData(cached);
      return;
    }

    fetchGasData()
      .then(d => {
        gasCacheSet(d); // 캐시 저장 (저장 시각 기록)
        applyData(d);
      })
      .catch(e => {
        // 새로 받기 실패 → 만료된 캐시라도 있으면 사용
        const stale = gasCacheGetStale();
        if (stale) { console.warn("[GAS] 호출 실패, 만료된 캐시로 표시:", e); applyData(stale); return; }
        setErr(String(e)); setIsLoading(false);
      });
  }, []);

  function persistList(list, lastId) {
    lsSet({ list:list.filter(l=>!l.isDefault), lastId });
  }

  /* ── 저장된 로드아웃 순서 변경 (드래그 앤 드롭) ──
   * 기본 제공 로드아웃은 항상 맨 위 고정, 드래그 대상에서 제외.
   * mouse/touch 모두 pointer events로 처리. */
  const savedLoadoutsRef = useRef(savedLoadouts);
  useEffect(() => { savedLoadoutsRef.current = savedLoadouts; }, [savedLoadouts]);
  const dragLoadoutRef = useRef(null); // { id }

  function reorderSavedLoadouts(draggedId, overId) {
    const prev = savedLoadoutsRef.current;
    const overItem = prev.find(l => String(l.id) === String(overId));
    if (!overItem || overItem.isDefault) return; // 기본 항목 위로는 드롭 불가

    const defaultItem = prev.find(l => l.isDefault) ?? null;
    const rest = prev.filter(l => !l.isDefault);
    const fromIdx = rest.findIndex(l => String(l.id) === String(draggedId));
    const toIdx   = rest.findIndex(l => String(l.id) === String(overId));
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const nextRest = [...rest];
    const [moved] = nextRest.splice(fromIdx, 1);
    nextRest.splice(toIdx, 0, moved);
    const next = defaultItem ? [defaultItem, ...nextRest] : nextRest;
    setSavedLoadouts(next);
  }

  function handleLoadoutDragPointerMove(e) {
    const draggedId = dragLoadoutRef.current?.id;
    if (draggedId == null) return;
    const point = e.touches ? e.touches[0] : e;
    const el  = document.elementFromPoint(point.clientX, point.clientY);
    const row = el && el.closest ? el.closest(".manageItem") : null;
    const overId = row?.dataset?.loadoutId;
    if (overId == null || String(overId) === String(draggedId)) return;
    reorderSavedLoadouts(draggedId, overId);
  }
  function handleLoadoutDragPointerUp() {
    window.removeEventListener("pointermove", handleLoadoutDragPointerMove);
    window.removeEventListener("pointerup",   handleLoadoutDragPointerUp);
    window.removeEventListener("pointercancel", handleLoadoutDragPointerUp);
    if (dragLoadoutRef.current) {
      persistList(savedLoadoutsRef.current, activeLoadoutId);
    }
    dragLoadoutRef.current = null;
    setDraggingLoadoutId(null);
  }

  /* ── 행 전체로 드래그 시작 (PC 전용) ──
   * PC(mouse): 누른 채로 일정 거리 이상 움직이면 드래그 시작.
   * 모바일(touch)에서는 스크롤과 충돌/오작동 문제로 드래그를 지원하지 않고
   * 대신 위/아래 버튼(moveLoadout)으로 순서를 바꾼다. */
  const LOADOUT_MOUSE_DRAG_THRESHOLD = 6;
  const pendingDragRef = useRef(null); // { id, startX, startY, pointerType }

  function clearPendingLoadoutDrag() {
    pendingDragRef.current = null;
    window.removeEventListener("pointermove", handleLoadoutRowPointerMove);
    window.removeEventListener("pointerup",   handleLoadoutRowPointerUp);
    window.removeEventListener("pointercancel", handleLoadoutRowPointerUp);
  }
  function startActualLoadoutDrag(id) {
    dragLoadoutRef.current = { id };
    setDraggingLoadoutId(id);
    window.addEventListener("pointermove", handleLoadoutDragPointerMove);
    window.addEventListener("pointerup",   handleLoadoutDragPointerUp);
    window.addEventListener("pointercancel", handleLoadoutDragPointerUp);
  }
  function handleLoadoutRowPointerMove(e) {
    const st = pendingDragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX, dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);
    if (dist > LOADOUT_MOUSE_DRAG_THRESHOLD) {
      const id = st.id;
      clearPendingLoadoutDrag();
      startActualLoadoutDrag(id);
      handleLoadoutDragPointerMove(e);
    }
  }
  function handleLoadoutRowPointerUp() { clearPendingLoadoutDrag(); }
  function handleLoadoutRowPointerDown(e, id, isDefault) {
    if (isDefault) return;
    if (dragLoadoutRef.current) return; // 이미 드래그 중
    if (e.pointerType !== "mouse") return; // 모바일(touch/pen)은 드래그 비활성화 — 위/아래 버튼 사용
    if (e.target && e.target.closest && e.target.closest("button, input, select, a, textarea")) return;

    pendingDragRef.current = { id, startX:e.clientX, startY:e.clientY, pointerType:e.pointerType };
    window.addEventListener("pointermove", handleLoadoutRowPointerMove);
    window.addEventListener("pointerup",   handleLoadoutRowPointerUp);
    window.addEventListener("pointercancel", handleLoadoutRowPointerUp);
  }

  /* ── 모바일용 위/아래 버튼으로 순서 변경 (전체 목록 기준) ── */
  function moveLoadout(id, delta) {
    const rest = savedLoadouts.filter(l=>!l.isDefault);
    const defaultItem = savedLoadouts.find(l=>l.isDefault) ?? null;
    const idx = rest.findIndex(l=>l.id===id);
    if (idx===-1) return;
    const newIdx = idx+delta;
    if (newIdx<0 || newIdx>=rest.length) return;
    const nextRest=[...rest];
    const [moved]=nextRest.splice(idx,1);
    nextRest.splice(newIdx,0,moved);
    const next = defaultItem ? [defaultItem,...nextRest] : nextRest;
    setSavedLoadouts(next);
    persistList(next, activeLoadoutId);
  }

  /* ── 순서 번호 직접 입력으로 이동은 필터 정의 이후로 이동 (필터링된 순서를 반영하기 위함) ── */

  /* ── 관리 모달 필터 (지원무기 대분류 → 지원무기 소분류 / 주무장 소분류, AND 결합) ──
   * 각 필터의 선택지는 나머지 필터 조건을 만족하는 로드아웃에서만 뽑아 좁혀짐(상호 연동).
   * 지원무기 대분류: 로드아웃에 해당 분류의 지원무기가 하나라도 있으면 일치. */
  const [filterSupportClass,  setFilterSupportClass]  = useState("");   // "" | "대전차 지원무기" | "비대전차 지원무기"
  const [filterSupportWeapon, setFilterSupportWeapon] = useState("");
  const [filterWeaponType,    setFilterWeaponType]    = useState("");

  function getSupportItemsOf(l) {
    return (Array.isArray(l.selected?.stratagem)?l.selected.stratagem:[]).filter(Boolean)
      .filter(it => SUPPORT_WEAPON_SUBTYPES_ALL.has(getSubType(it)));
  }
  function getSupportNamesOf(l, cls="") {
    return getSupportItemsOf(l)
      .filter(it => !cls || getSupportClass(it)===cls)
      .map(it => s(it.name_ko||it.id)).filter(Boolean);
  }
  function getWeaponTypeOf(l) {
    return s(l.selected?.primary?.weaponType);
  }
  const matchClass   = (l) => !filterSupportClass  || getSupportNamesOf(l, filterSupportClass).length>0;
  const matchSupport = (l) => !filterSupportWeapon || getSupportNamesOf(l).includes(filterSupportWeapon);
  const matchWT      = (l) => !filterWeaponType    || getWeaponTypeOf(l)===filterWeaponType;

  const manageSupportClassOptions = useMemo(() => {
    const base = savedLoadouts.filter(matchWT);
    return SUPPORT_CLASS_ORDER.filter(cls => base.some(l => getSupportNamesOf(l, cls).length>0));
  }, [savedLoadouts, filterWeaponType]); // eslint-disable-line react-hooks/exhaustive-deps

  const manageSupportWeaponOptions = useMemo(() => {
    const base = savedLoadouts.filter(l => matchWT(l) && matchClass(l));
    const set = new Set();
    base.forEach(l => getSupportNamesOf(l, filterSupportClass).forEach(n=>set.add(n)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
  }, [savedLoadouts, filterWeaponType, filterSupportClass]); // eslint-disable-line react-hooks/exhaustive-deps

  const manageWeaponTypeOptions = useMemo(() => {
    const base = savedLoadouts.filter(l => matchClass(l) && matchSupport(l));
    const set = new Set();
    base.forEach(l => { const wt=getWeaponTypeOf(l); if (wt) set.add(wt); });
    return sortWeaponTypes(Array.from(set));
  }, [savedLoadouts, filterSupportClass, filterSupportWeapon]); // eslint-disable-line react-hooks/exhaustive-deps

  // 다른 필터 변경으로 현재 선택값이 더 이상 유효한 선택지가 아니게 되면 초기화
  useEffect(() => {
    if (filterSupportClass && !manageSupportClassOptions.includes(filterSupportClass)) setFilterSupportClass("");
  }, [manageSupportClassOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filterSupportWeapon && !manageSupportWeaponOptions.includes(filterSupportWeapon)) setFilterSupportWeapon("");
  }, [manageSupportWeaponOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filterWeaponType && !manageWeaponTypeOptions.includes(filterWeaponType)) setFilterWeaponType("");
  }, [manageWeaponTypeOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const manageFilterActive = !!(filterSupportClass || filterSupportWeapon || filterWeaponType);
  function resetManageFilters() { setFilterSupportClass(""); setFilterSupportWeapon(""); setFilterWeaponType(""); }
  const manageFilterCount = [filterSupportClass, filterSupportWeapon, filterWeaponType].filter(Boolean).length;
  const [manageFilterPopup, setManageFilterPopup] = useState(false);   // 모바일 필터 팝업

  const filteredSavedLoadouts = useMemo(() => {
    if (!manageFilterActive) return savedLoadouts;
    return savedLoadouts.filter(l => matchClass(l) && matchSupport(l) && matchWT(l));
  }, [savedLoadouts, manageFilterActive, filterSupportClass, filterSupportWeapon, filterWeaponType]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 순서 번호 직접 입력으로 이동 (스팀 찜 목록 방식) ──
   * 필터가 걸려있어도 뱃지 번호는 항상 "저장된 로드아웃 전체 목록" 기준 실제 순서를 표시. */
  const [positionEditId,    setPositionEditId]    = useState(null);
  const [positionEditValue, setPositionEditValue] = useState("");

  const userLoadoutPositions = useMemo(() => {
    const m = new Map();
    savedLoadouts.filter(l=>!l.isDefault).forEach((l,i)=>m.set(l.id,i+1));
    return m;
  }, [savedLoadouts]);

  function startPositionEdit(id) {
    setPositionEditId(id);
    setPositionEditValue(String(userLoadoutPositions.get(id) ?? ""));
  }
  function cancelPositionEdit() {
    setPositionEditId(null);
    setPositionEditValue("");
  }
  function commitPositionEdit(id) {
    const rest = savedLoadouts.filter(l=>!l.isDefault);
    const defaultItem = savedLoadouts.find(l=>l.isDefault) ?? null;
    const fromIdx = rest.findIndex(l=>l.id===id);
    if (fromIdx === -1) { cancelPositionEdit(); return; }

    let target = parseInt(positionEditValue, 10);
    if (!Number.isFinite(target) || target < 1) target = 1;
    if (target > rest.length) target = rest.length;
    const toIdx = target - 1;

    if (toIdx !== fromIdx) {
      const nextRest = [...rest];
      const [moved] = nextRest.splice(fromIdx, 1);
      nextRest.splice(toIdx, 0, moved);
      const next = defaultItem ? [defaultItem, ...nextRest] : nextRest;
      setSavedLoadouts(next);
      persistList(next, activeLoadoutId);
    }
    cancelPositionEdit();
  }

  const allWbOptions = useMemo(() => getWbOptionsFromItems(items), [items]);
  useEffect(() => {
    if (!items.length || ownedWb !== null) return;
    if (isFirstVisitRef.current) {
      setOwnedWbState(new Set());       // 팝업에서 확정하기 전까지는 저장하지 않음
      setWbOwnedPopup("first");
    } else {
      setOwnedWb(migrateLegacyOwnedWb(items));
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  function confirmWbOwnedPopup(set) {
    setOwnedWb(new Set(set));
    if (wbOwnedPopup === "first") { wbNoticeSetDismiss(); isFirstVisitRef.current = false; }
    setWbOwnedPopup(null);
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
    // 선택 항목이 없거나 stratagem이 배열이 아닌 경우 방어 처리
    if (!selected || !Array.isArray(selected.stratagem)) return {
      uniqueTraits:[], wbSummary:[], roleTags:[], missionTags:[],
      fireformGear:[], fireformStrat:[], hasIdealBody:false,
      armorPassive:"", armorPersonalNotes:[], radarData:null,
    };
    try {
    const allTraits = [];
    for (const k of ["primary","secondary","throwable"]) {
      const it = selected[k]; if (!it) continue;
      for (const f of ["trait1","trait2","trait3"]) { const t=s(it[f]); if(t) allTraits.push(t); }
    }

    /* ── 필요 채권 요약 (헬다이버 출동! 포함) ── */
    const allItems = [
      selected.armor, selected.primary, selected.secondary, selected.throwable,
      ...selected.stratagem,
    ].filter(Boolean);
    const wbSummary = computeWbSummary(selected);

    /* ════════════════════════════════════════════
       공통 상수
    ════════════════════════════════════════════ */
    const SUPPORT_WEAPON_SUBTYPES = new Set(["지원무기","일회용 지원무기","지원배낭 무기"]);

    const AT_EXCLUDE_IDS = ["th_sp_gas4","g123","cqc20","sw_arc","bp_b100","gp20","bp_ax9","ep_at12","ep_md8",
      "sw_tx41","bp_ax13"];  // 가스 지원무기/배낭: rolePen 계산 제외 (전투보조만 표시)
    // 대전차 전담을 부분적으로 강등시키는 아이템 (gp20 제외 — 대전차 전담 유지)
    const DEMOTE_AT_IDS  = ["g123","las99","stax3","500kg","orb_rc","orb_ls","orb_ps","cqc20","sw_arc","bp_b100","ep_at12"];
    // 단독으로 부분적 대전차 가능 태그를 표시하는 아이템 (gp20 포함)
    const PARTIAL_AT_IDS = [...DEMOTE_AT_IDS, "gp20"];
    const AT_SUPPORT_IDS = ["gr8","faf14","rr_","spear"];

    const FORCE_SMALL_IDS              = ["sw_flam","sp_flam","st_flam","p72"];
    const ERGO_FORCE_THROW_IDS         = ["sw_c4"];  // 지원무기 중 "투척" ergo 강제 표시
    const ROLE_SUPPRESS_IDS            = [];    // 개별 처리로 전환
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

    const throwableIt  = selected.throwable;
    const throwableId  = throwableIt ? s(throwableIt?.id).toLowerCase() : "";
    const throwableRaw = throwableIt ? s(throwableIt?.armorPen) : "";
    const throwablePen = (throwableRaw && throwableRaw !== "비살상") ? (Number(throwableRaw)||0) : 0;

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
    // 투척무기는 weaponMaxPen에 반영하지 않음 — grenadeTag로 별도 처리

    // 수류탄 역할 태그 분류
    const isThrowableGrenade = throwableIt && throwableId.startsWith("th_");
    const hasGrenadeAT      = isThrowableGrenade && throwablePen >= 5
      && !GRENADE_PARTIAL_MED_EXCLUDE.some(ex => throwableId.includes(ex));
    const hasGrenadePartialMed = isThrowableGrenade && !hasGrenadeAT && (
      (throwablePen === 4
        && !GRENADE_PARTIAL_MED_EXCLUDE.some(ex => throwableId.includes(ex)))
      || GRENADE_PARTIAL_MED_FORCE.some(f => throwableId.includes(f))
    );
    const hasGrenadeSmall = isThrowableGrenade && !hasGrenadeAT && !hasGrenadePartialMed
      && throwablePen >= 2 && throwablePen <= 3
      && !GRENADE_PARTIAL_MED_EXCLUDE.some(ex => throwableId.includes(ex));

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
    const C_AT      = "#ef4444";
    const C_PAT     = "#e05353";
    const C_MED     = "#ffa32b";
    const C_SMALL   = "#94a3b8";
    const C_SUPP    = "#34d399";
    const C_VEHICLE = "#93c5fd";

    /* ─ 역할 태그 레이블 상수 ─ */
    const LBL_SMALL   = "경장갑 ~ 일반 장갑 대응";
    const LBL_MED     = "일반 장갑 ~ 중장갑 대응";
    const LBL_AT      = "대전차 대응";
    const LBL_PAT     = "대전차 대응(제한적)";
    const LBL_PMED    = "중장갑 대응(제한적)";
    const LBL_PVEH    = "부분적 대전차(탑승물)";

    /* ─ 역할 태그 조립 ─ */
    const partialATActive  = (hasDisposableAT || hasDemoteATId) && !hasTrueATSupport;
    const upgradedByOrbEag = hasTrueATSupport && hasOrbOrEag;

    function weaponRoleTag() {
      const hasForceSmall = ["primary","secondary"].some(k => {
        const it = selected[k]; if (!it) return false;
        return FORCE_SMALL_IDS.some(r => s(it?.id).toLowerCase().includes(r));
      });
      if (hasForceSmall && weaponMaxPen === 0) return { label:LBL_SMALL, color:C_SMALL };
      if (weaponMaxPen >= 6) return { label:LBL_AT,    color:C_AT    };
      if (weaponMaxPen >= 4) return { label:LBL_MED,   color:C_MED   };
      if (weaponMaxPen >  0) return { label:LBL_SMALL, color:C_SMALL };
      if (hasForceSmall)     return { label:LBL_SMALL, color:C_SMALL };
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
        ? { label:LBL_PAT, color:C_PAT }
        : { label:LBL_AT,  color:C_AT  };
    } else if (rolePen >= 4) {
      mainRoleTag = { label:LBL_MED,   color:C_MED   };
    } else if (rolePen > 0) {
      mainRoleTag = { label:LBL_SMALL, color:C_SMALL };
    } else if (hasForceSmall) {
      mainRoleTag = { label:LBL_SMALL, color:C_SMALL };
    }
    if (upgradedByOrbEag && mainRoleTag) mainRoleTag = { label:LBL_AT, color:C_AT };

    let extraWeaponTag = null;
    if (mainRoleTag?.label === LBL_PAT) extraWeaponTag = weaponRoleTag();

    let loosePartialTag = null;
    if ((hasPartialATId || hasDisposableAT) && !hasTrueATSupport && rolePen < 6 && mainRoleTag?.label !== LBL_PAT)
      loosePartialTag = { label:LBL_PAT, color:C_PAT };

    const grenadeTag = hasGrenadePartialMed
      ? { label:LBL_PMED, color:C_MED }
      : null;
    const grenadeSmallTag = hasGrenadeSmall
      ? { label:LBL_SMALL, color:C_SMALL }
      : null;
    const grenadeATTag = hasGrenadeAT
      ? { label:LBL_PAT, color:C_PAT }
      : null;

    const hasPartialMedStrat = selected.stratagem.some(it => {
      if (!it) return false;
      return PARTIAL_MED_SYNERGY_IDS.some(r => s(it?.id).toLowerCase().includes(r));
    });
    const partialMedStratTag = hasPartialMedStrat
      ? { label:LBL_PMED, color:C_MED }
      : null;

    const ROLE_ORDER = [LBL_SMALL, LBL_MED, LBL_AT, LBL_PMED, LBL_PAT, LBL_PVEH];
    const roleCandidates = [];
    if (extraWeaponTag)  roleCandidates.push(extraWeaponTag);
    if (mainRoleTag)     roleCandidates.push(mainRoleTag);
    if (grenadeTag) {
      // 지원무기/무기로 이미 MED 이상이 커버되면 수류탄 태그 불필요
      const alreadyCoveredByWeapon = rolePen >= 4;
      if (!alreadyCoveredByWeapon && !roleCandidates.some(t => t.label===LBL_MED))
        roleCandidates.push(grenadeTag);
    }
    if (grenadeSmallTag) {
      const alreadyCovered = rolePen >= 2;
      if (!alreadyCovered && !roleCandidates.some(t => t.label===LBL_SMALL || t.label===LBL_MED))
        roleCandidates.push(grenadeSmallTag);
    }
    if (grenadeATTag) {
      // 이미 대전차 이상이 커버되면 불필요
      if (!roleCandidates.some(t => t.label===LBL_AT || t.label===LBL_PAT))
        roleCandidates.push(grenadeATTag);
    }
    if (partialMedStratTag) {
      if (!roleCandidates.some(t => t.label === LBL_PMED))
        roleCandidates.push(partialMedStratTag);
    }
    if (loosePartialTag) roleCandidates.push(loosePartialTag);

    // ── 상위 태그 우선: 부분적 < 전담 ──
    const hasFullAT  = roleCandidates.some(t => t.label === LBL_AT);
    const hasFullMed = roleCandidates.some(t => t.label === LBL_MED);
    const filteredCandidates = roleCandidates.filter(t => {
      if (hasFullAT  && t.label === LBL_PAT)  return false;
      if (hasFullMed && t.label === LBL_PMED) return false;
      return true;
    });

    const suppressRole = allItems.some(it => {
      const id = s(it?.id).toLowerCase();
      return ROLE_SUPPRESS_IDS.some(r => id.includes(r));
    });
    // 중형 태그 억제: m102, ep_arc3, sp_p35
    const MED_SUPPRESS_NON_PARTIAL = ["m102","ep_arc3","sp_p35"];
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
    if (hasCombatSupport) roleTags.push({ label:"전투 보조",   color:C_SUPP    });
    if (hasVehicleAT)     roleTags.push({ label:LBL_PVEH,     color:"#93c5fd" });
    if (hasVehicle)       roleTags.push({ label:"탑승물 운용", color:C_VEHICLE });

    // 궤도/이글/방어 subType 역할 분류 (선택된 스트라타젬 기준)
    const hasOrb = selected.stratagem.some(it => it && s(getSubType(it)).includes("궤도"));
    const hasEag = selected.stratagem.some(it => it && s(getSubType(it)).includes("이글"));
    const hasDef = selected.stratagem.some(it => {
      if (!it) return false;
      const st = s(it?.stratType ?? "");
      const sub = s(getSubType(it));
      return st === "방어" && !["탑승물","지원무기","배낭","지원배낭 무기","일회용 지원무기"].includes(sub);
    });
    // 임무 지원 형태 태그 — roleTags와 분리
    const missionTags = [];
    if (hasOrb) missionTags.push({ label:"함선 화력지원 요청", color:"#fca5a5" });
    if (hasEag) missionTags.push({ label:"신속 화력지원 요청", color:"#fdba74" });
    if (hasDef) missionTags.push({ label:"전투 보조 요청",     color:"#6ee7b7" });

    /* ════════════════════════════════════════════
       구성 시너지
    ════════════════════════════════════════════ */
    const RANGE_IDS         = ["sg8p","plas101","plas15"];
    const BARRAGE_IDS       = ["mp98","p19","las16","las17","mg105","mg101","m1000","m105","st_g16"];
    const PRECISE_IDS       = ["dm_r2124","dm_r63","en_las5","dm_r63cs","ps_p4","dm_r6","dm_r2","plas39","dm_r72","las98","sw_apw1"];
    const AREA_CC_IDS       = ["th_sp_gas4","orb_gs","orb_ss","sp_g23","orb_ems"];
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

      // 투척무기(th_ prefix): 항상 범위형 (가스/기절 예외)
      if (id.startsWith("th_")) {
        const hasGas     = traits.includes("가스");
        const hasStun    = traits.includes("기절");
        const isDecoy    = id.includes("tm1");      // TM-1 유인 지뢰
        const isShield   = traits.includes("방어막");
        if (hasGas || hasStun) return "범위 CC";
        if (isShield)          return "방어막";
        if (isDecoy)           return "적 유인";
        return "범위형";
      }

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
      if (id.includes("sh20") || id.includes("sh51")) return "전방 방어";  // fireformStrat에서 subNotes override
      if (BARRIER_IDS.some(r => id.includes(r)))      return "전방 방어";
      if (MOBILITY_IDS.some(r => id.includes(r)))     return "기동력, 지형 활용";
      if (CQC_IDS.some(r => id.includes(r)))          return "근접";
      if (AREA_CC_IDS.some(r => id.includes(r)))      return "범위 CC";
      if (STOP_IDS.some(r => id.includes(r)))         return "대상 저지";
      if (SINGLE_ENTITY_IDS.some(r => id.includes(r))) return "단일 대상";
      if (DUAL_BARRAGE_IDS.some(r => id.includes(r))) return "단일 | 탄막형";
      if (id.includes("smg34"))                        return "단일 | 범위형(하단 화염방사기 한정)";
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

    // RS(굳건한 바위) 방어구 + BFM(둔기 충격 완화) 방어구 — 폭발무기 레그돌 억제 시너지 공유
    const isArmorRs = s(selected.armor?.id ?? "").toLowerCase().includes("ar_rs")
                   || s(selected.armor?.passive ?? "") === "둔기 충격 완화";
    const hasSh20 = selected.stratagem.some(it => it && s(it?.id).toLowerCase().includes("st_bp_sh20"));
    const hasSh51 = selected.stratagem.some(it => it && s(it?.id).toLowerCase().includes("st_bp_sh51"));

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
      const hasExplosiveTrait = traits.includes("폭발성");
      const hasOnehanded = traits.includes("한 손 파지");
      if (traits.some(t => t.includes("과열"))) {
        subNotes.push({ text:"과열시 관통 등급 향상", kind:"pos" });
        if (armorPassive === "인화성 물질") {
          subNotes.push({ text:"과열 피해 감소", kind:"pos" });
        } else {
          subNotes.push({ text:"과열 피해", kind:"neg" });
        }
      }
      // 5번: ar_rs 방어구 + 폭발성 무기 → 레그돌 억제 / 향상된 레그돌 억제
      if (isArmorRs && hasExplosiveTrait && k !== "throwable") {
        if (hasSh20 && hasOnehanded) {
          // 11번: sh20 + 한 손 파지 + 폭발성 → 향상된 레그돌 억제
          subNotes.push({ text:"향상된 레그돌 억제", kind:"pos" });
        } else {
          subNotes.push({ text:"레그돌 억제", kind:"pos" });
        }
      }
      // 7번: sh20/sh51 + 한 손 파지 → 전방 방어 서브노트
      if ((hasSh20 || hasSh51) && hasOnehanded && k !== "throwable") {
        subNotes.push({ text:"전방 방어", kind:"pos" });
      }
      // 8번: sh20 + 한 손 파지 아닌 무기(투척 제외) → 수납중 후방 보호
      if (hasSh20 && !hasOnehanded && k !== "throwable") {
        subNotes.push({ text:"수납중 후방 보호", kind:"pos" });
      }
      // ── 패시브 방어구 상태이상 피해 감소 (subNotes 텍스트)
      if (armorPassive) {
        const soiForm   = s(form);
        const isFlamId  = ["sw_flam","sp_flam","st_flam","bflam80","smg34"].some(r => id.includes(r));
        const isSoiFire = traits.includes("소이") &&
          (soiForm.includes("범위형") || soiForm.includes("횡방향 화력투사") || soiForm.includes("구역 화력투사") || isFlamId);
        const isGasSelf  = traits.includes("가스") && !id.includes("p35");
        const isArcSelf  = traits.includes("아크") && !id.includes("en_arc") && !id.includes("sw_arc");
        const hasOverheat = traits.includes("과열") || id.includes("las17");
        // ++ 단일 고수치 패시브
        if (armorPassive === "인화성 물질") {
          if (isSoiFire)   subNotes.push({ text:"++ 화염 피해 감소", kind:"pos2" });
          if (hasOverheat) subNotes.push({ text:"++ 과열 피해 감소", kind:"pos2" });
        }
        if (armorPassive === "고급 여과" && isGasSelf)  subNotes.push({ text:"++ 가스 피해 감소", kind:"pos2" });
        if (armorPassive === "전도성"    && isArcSelf)  subNotes.push({ text:"++ 아크 피해 감소", kind:"pos2" });
        // + 복합·저수치 패시브
        if (armorPassive === "아드레노-제세동기" && isArcSelf) subNotes.push({ text:"+ 아크 피해 감소", kind:"pos2" });
        if (["적응력","사막 돌격대"].includes(armorPassive)) {
          if (isSoiFire)   subNotes.push({ text:"+ 화염 피해 감소",  kind:"pos2" });
          if (isGasSelf)   subNotes.push({ text:"+ 가스 피해 감소",  kind:"pos2" });
          if (isArcSelf)   subNotes.push({ text:"+ 아크 피해 감소",  kind:"pos2" });
          if (hasOverheat) subNotes.push({ text:"+ 과열 피해 감소",  kind:"pos2" });
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
        // ── 패시브 방어구 상태이상 피해 감소
        if (armorPassive) {
          const soiForm   = s(form);
          const isFlamId  = ["sw_flam","sp_flam","st_flam","bflam80","ax75"].some(r => id.includes(r));
          const isSoiFire = supportTraits.includes("소이") &&
            (soiForm.includes("범위형") || soiForm.includes("횡방향 화력투사") || soiForm.includes("구역 화력투사") || isFlamId);
          const isGasSelf  = supportTraits.includes("가스") && !id.includes("p35");
          const isArcSelf  = supportTraits.includes("아크") && !id.includes("en_arc") && !id.includes("sw_arc");
          const hasOverheat = supportTraits.includes("과열") || id.includes("las17");
          if (armorPassive === "인화성 물질") {
            if (isSoiFire)   subNotes.push({ text:"++ 화염 피해 감소", kind:"pos2" });
            if (hasOverheat) subNotes.push({ text:"++ 과열 피해 감소", kind:"pos2" });
          }
          if (armorPassive === "고급 여과" && isGasSelf)  subNotes.push({ text:"++ 가스 피해 감소", kind:"pos2" });
          if (armorPassive === "전도성"    && isArcSelf)  subNotes.push({ text:"++ 아크 피해 감소", kind:"pos2" });
          if (armorPassive === "아드레노-제세동기" && isArcSelf) subNotes.push({ text:"+ 아크 피해 감소", kind:"pos2" });
          if (["적응력","사막 돌격대"].includes(armorPassive)) {
            if (isSoiFire)   subNotes.push({ text:"+ 화염 피해 감소",  kind:"pos2" });
            if (isGasSelf)   subNotes.push({ text:"+ 가스 피해 감소",  kind:"pos2" });
            if (isArcSelf)   subNotes.push({ text:"+ 아크 피해 감소",  kind:"pos2" });
            if (hasOverheat) subNotes.push({ text:"+ 과열 피해 감소",  kind:"pos2" });
          }
        }
        fireformGear.push({ label:"지원무기", name:s(it.name_ko||it.id), form, ergo, id, subNotes, passiveNotes:[] });
      }
    }

    // 한 손 파지 무기 선택 여부 (투척 제외)
    const hasOnehandedGear = ["primary","secondary"].some(k => {
      const it = selected[k]; if (!it) return false;
      return [s(it?.trait1),s(it?.trait2),s(it?.trait3)].includes("한 손 파지");
    });

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

      // 9번: sh20 선택 + 한 손 파지 없음 → 전방 방어 대신 수납중 후방 보호
      // 10번: sh51 선택 + 한 손 파지 없음 → 전방 방어 제거, 시너지 없음 표시
      if (id.includes("st_bp_sh20")) {
        if (hasOnehandedGear) {
          subNotes.push({ text:"전방 방어", kind:"pos" });
        } else {
          subNotes.push({ text:"수납중 후방 보호", kind:"pos" });
        }
      } else if (id.includes("st_bp_sh51")) {
        if (hasOnehandedGear) {
          subNotes.push({ text:"전방 방어", kind:"pos" });
        } else {
          subNotes.push({ text:"시너지 장비가 없습니다.", kind:"neg" });
        }
      }

      // 호출 시간: stratType이 공격/방어 또는 subType이 탑승물인 경우
      const stratType  = s(it?.stratType ?? "");
      const stratSub   = s(it?.subType ?? it?.subtype ?? "");
      const respTime   = s(it?.responseTime ?? "");
      const showResp   = !!(respTime && (["공격","방어"].includes(stratType) || stratSub === "탑승물"));
      // ── 패시브 방어구 상태이상 피해 감소 (인라인 trait 체크)
      if (armorPassive) {
        const soiForm    = s(form);
        const isFlamId   = ["sw_flam","sp_flam","st_flam","bflam80","ax75"].some(r => id.includes(r));
        const stratTraits = [s(it?.trait1),s(it?.trait2),s(it?.trait3)];
        const isSoiFire  = stratTraits.includes("소이") &&
          (soiForm.includes("범위형") || soiForm.includes("횡방향 화력투사") || soiForm.includes("구역 화력투사") || isFlamId);
        const isGasSelf  = stratTraits.includes("가스") && !id.includes("p35");
        const isArcSelf  = stratTraits.includes("아크") && !id.includes("en_arc") && !id.includes("sw_arc");
        const hasOverheat = stratTraits.includes("과열") || id.includes("las17");
        if (armorPassive === "인화성 물질") {
          if (isSoiFire)   subNotes.push({ text:"++ 화염 피해 감소", kind:"pos2" });
          if (hasOverheat) subNotes.push({ text:"++ 과열 피해 감소", kind:"pos2" });
        }
        if (armorPassive === "고급 여과" && isGasSelf)  subNotes.push({ text:"++ 가스 피해 감소", kind:"pos2" });
        if (armorPassive === "전도성"    && isArcSelf)  subNotes.push({ text:"++ 아크 피해 감소", kind:"pos2" });
        if (armorPassive === "아드레노-제세동기" && isArcSelf) subNotes.push({ text:"+ 아크 피해 감소", kind:"pos2" });
        if (["적응력","사막 돌격대"].includes(armorPassive)) {
          if (isSoiFire)   subNotes.push({ text:"+ 화염 피해 감소",  kind:"pos2" });
          if (isGasSelf)   subNotes.push({ text:"+ 가스 피해 감소",  kind:"pos2" });
          if (isArcSelf)   subNotes.push({ text:"+ 아크 피해 감소",  kind:"pos2" });
          if (hasOverheat) subNotes.push({ text:"+ 과열 피해 감소",  kind:"pos2" });
        }
      }
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

    // ── 반동 감소 블랙리스트 / 화이트리스트 ──
    // subType 기반 블랙리스트 (일회용 지원무기, 배낭, 탑승물)
    const RECOIL_BL_SUBTYPES = new Set(["일회용 지원무기", "배낭", "탑승물"]);
    // ID 기반 블랙리스트 (소문자, itId와 직접 비교)
    const RECOIL_BL_IDS = new Set([
      "pr_en_arc12","se_sp_las7","pr_en_las5","pr_ex_r36","pr_ex_cb9",
      "se_sp_gp31","pr_sp_flam66","se_sp_p72","se_sp_p33",
      "st_sw_las98","st_sw_gr8","st_sw_flam40","st_sw_arc3","st_sw_rl77",
      "st_sw_las99","st_sw_faf14","st_sw_rs422","st_sw_stax3","st_sw_tx41",
      "st_sw_cqc1","st_sw_plas45","st_sw_s11","st_sw_cqc9","st_sw_c4",
      "st_sw_cqc20","st_sw_bflam80","st_ep_at12",
    ]);
    // ID 기반 화이트리스트 (블랙리스트 subType이어도 반동 감소 적용)
    const RECOIL_WL_IDS = new Set(["st_sw_mls4x","st_sw_mgx42"]);

    // 반동 감소 적용 가능 여부 판별
    // itId: s(it?.id).toLowerCase() 로 전처리된 소문자 ID 문자열
    // it:   원본 아이템 객체 (subType 조회용)
    function canApplyRecoil(itId, it) {
      if (RECOIL_WL_IDS.has(itId)) return true;
      if (RECOIL_BL_IDS.has(itId)) return false;
      const subT = getSubType(it);
      if (RECOIL_BL_SUBTYPES.has(subT)) return false;
      return true;
    }

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

      // ── 강화 → 반동 감소 (플라즈마 특성 보유 항목만 / 슬롯 무관 / 블랙리스트 제외)
      if (armorPassive === "강화") {
        if (hasTrait(it, "플라즈마") && canApplyRecoil(itId, it))
          posNotes.push("반동 감소");
      }
      // ── 공병 키트 → 반동 감소 (주무기, 보조무기, 지원무기 / 블랙리스트 제외)
      if (armorPassive === "공병 키트") {
        if ((isPrimary || isSecondary || isSupportRow) && canApplyRecoil(itId, it))
          posNotes.push("반동 감소");
      }
      // ── 공병 키트 / 통합 폭발물 → 투입시 추가 보유 + 최대 소지량 (투척무기)
      if (["공병 키트","통합 폭발물"].includes(armorPassive)) {
        if (isThrowable) posNotes.push("투입시 추가 보유", "최대 소지량");
      }
      // ── 서보 보조 / 사막 돌격대 → 투척 비거리
      //    투척무기(type="투척무기") 또는 공격 스트라타젬(stratType="공격") 중 range="투척",
      //    또는 ERGO_FORCE_THROW_IDS(sw_c4 등), sp_g50 / sp_at60(유도형) 제외
      if (["서보 보조","사막 돌격대"].includes(armorPassive)) {
        const isThrowRange = s(it?.range) === "투척" &&
          (s(it?.type) === "투척무기" || s(it?.stratType) === "공격");
        const isForceThrow = ERGO_FORCE_THROW_IDS.some(r => itId.includes(r));
        if ((isThrowRange || isForceThrow) && !["sp_g50","sp_at60"].some(r => itId.includes(r)))
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
      // ── 결연함 → 1인칭 피격 흔들림 감소 (주무기, 보조무기, 지원무기 / 스트라타젬 제외)
      if (armorPassive === "결연함") {
        if (isPrimary || isSecondary || isSupportRow)
          posNotes.push("1인칭 피격 흔들림 감소");
      }
      // ── 포위 준비 완료 → 추가 탄약 (주무기, 지원무기 / 스트라타젬 제외)
      if (armorPassive === "포위 준비 완료") {
        const excAmmo =
          itId.includes("sp_gp20") || itId.includes("sw_las99") ||
          itId.includes("en_arc12") || itId.includes("sw_arc") ||
          (itId.includes("cqc") && !itId.includes("cqc20")) ||
          isBpWeapon || isDisp || isThrowable;
        if (!excAmmo && (isPrimary || isSupportRow))
          posNotes.push("추가 탄약");
      }
      // ── 총잡이 → 재장전 속도, 전환 속도, 반동 감소 (보조무기)
      if (armorPassive === "총잡이" && isSecondary)
        posNotes.push("재장전 속도", "전환 속도", "반동 감소");
      // ── 충격 방지 패드, 척탄병 → 폭발 피해 감소(폭발성), 수류탄 추가 보유(투척)
      if (armorPassive === "충격 방지 패드, 척탄병") {
        if (hasTrait(it, "폭발성")) posNotes.push("폭발 피해 감소");
        if (isThrowable)            posNotes.push("투입시 추가 보유", "최대 소지량");
      }
      // ── 충격 방지 패드, 위험물 → 폭발 피해 감소(폭발성), 가스 피해 감소(가스), 반동 감소(보조무기)
      if (armorPassive === "충격 방지 패드, 위험물") {
        if (hasTrait(it, "폭발성")) posNotes.push("폭발 피해 감소");
        if (hasTrait(it, "가스"))   posNotes.push("가스 피해 감소");
        if (isSecondary)            posNotes.push("반동 감소");
      }
      // ── 충격 방지 패드, 강화 버전 → 폭발 피해 감소(폭발성)
      if (armorPassive === "충격 방지 패드, 강화 버전") {
        if (hasTrait(it, "폭발성")) posNotes.push("폭발 피해 감소");
      }
      // ── 이상적인 체형 → 핸들링 향상 (Ergo=낮음/보통인 주무기, 보조무기, 지원무기)
      if (armorPassive === "이상적인 체형") {
        const ergoEligible = rowErgo === "낮음" || rowErgo === "보통";
        if ((isPrimary || isSecondary || isSupportRow) && ergoEligible)
          posNotes.push("핸들링 향상");
      }
      // ── 강화 → 반동 감소 (주무기, 보조무기, 지원무기 / 블랙리스트 제외)
      if (armorPassive === "강화") {
        if ((isPrimary || isSecondary || isSupportRow) && canApplyRecoil(itId, it)) posNotes.push("반동 감소");
      }
      // ── 굳건한 바위 / 둔기 충격 완화 → 레그돌 억제 (폭발성 trait, 블랙리스트 제외)
      if (armorPassive === "굳건한 바위" || armorPassive === "둔기 충격 완화") {
        const ROCK_BL = ["sp_gp20","sp_g50","sp_ted63","th_gr_g7","sp_g48","sp_p33","sw_eat411"];
        if (hasTrait(it,"폭발성") && !ROCK_BL.some(r => itId.includes(r))) posNotes.push("레그돌 억제");
      }
      // ── 전도성 / 아드레노-제세동기 → 아크 피해 감소
      if (["전도성","아드레노-제세동기"].includes(armorPassive)) {
        if (hasTrait(it,"아크") && !itId.includes("en_arc") && !itId.includes("sw_arc"))
          posNotes.push("아크 피해 감소");
      }
      // ── 포위 준비 완료 → 보조무기 추가 탄약
      if (armorPassive === "포위 준비 완료" && isSecondary) {
        if (!["sp_gp20","sw_arc","sw_cqc1","sw_cqc9"].some(r => itId.includes(r))) posNotes.push("추가 탄약");
      }
      // ── 고급 여과 / 충격 방지 패드, 위험물 → 가스 피해 감소
      if (["고급 여과","충격 방지 패드, 위험물"].includes(armorPassive)) {
        if (hasTrait(it,"가스") && !itId.includes("p35")) posNotes.push("가스 피해 감소");
      }
      // ── 적응력 / 사막 돌격대 → 상태이상 피해 감소
      if (["적응력","사막 돌격대"].includes(armorPassive)) {
        const BL = ["pr_sg_sg225ie","pr_sg_sg451","pr_ar_ar2","pr_en_las5","se_sp_las7","se_sp_p35","pr_en_arc12","st_sw_arc3"];
        if (!BL.some(r => itId.includes(r.toLowerCase()))) {
          if (hasTrait(it,"소이") || hasTrait(it,"아크") || hasTrait(it,"가스")) posNotes.push("상태이상 피해 감소");
        }
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
      // 굳건한 바위 → 레그돌 억제는 개인 목록 제거 (구성 시너지로 이동)
      // 보급 아드레날린 → 피해를 받을때 스태미나 회복
      if (armorPassive === "보급 아드레날린")
        armorPersonalNotes.push("피해를 받을때 스태미나 회복");
      // 추가 완충제 / 결연함 / 보급 아드레날린 → 받는 피해 감소
      if (["추가 완충제","결연함","보급 아드레날린"].includes(armorPassive))
        armorPersonalNotes.push("받는 피해 감소");
      // 강화된 견장 → 확률적 사지 부상 방지
      if (armorPassive === "강화된 견장")
        armorPersonalNotes.push("확률적 사지 부상 방지");
      // 충격 방지 패드, 강화 버전 → 받는 피해 감소 (추가 완충제와 동일)
      if (armorPassive === "충격 방지 패드, 강화 버전")
        armorPersonalNotes.push("받는 피해 감소");
    }
    // 문자열을 pos kind 객체로 정규화
    const normalizedPersonalNotes = armorPersonalNotes.map(n =>
      typeof n === "string" ? { text: n, kind:"pos" } : n
    );

    return {
      uniqueTraits: [...new Set(allTraits)],
      wbSummary,
      roleTags,
      missionTags,
      fireformGear,
      fireformStrat,
      hasIdealBody,
      armorPassive,
      armorPersonalNotes: normalizedPersonalNotes,
      radarData: calcRadarLayers(selected),
    };
    } catch(e) {
      console.error("stats useMemo error:", e);
      return {
        uniqueTraits:[], wbSummary:[], roleTags:[], missionTags:[],
        fireformGear:[], fireformStrat:[], hasIdealBody:false,
        armorPassive:"", armorPersonalNotes:[], radarData:null,
      };
    }
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
    // 저장된 id 기반으로 최신 GAS 아이템 데이터로 재매핑 (태그 등 업데이트 반영)
    const byId = new Map(items.map(it => [it.id, it]));
    const remapItem = (it) => it ? (byId.get(String(it.id)) ?? it) : null;
    const remapped = {
      stratagem: (entry.selected.stratagem ?? [null,null,null,null]).map(remapItem),
      armor:     remapItem(entry.selected.armor),
      primary:   remapItem(entry.selected.primary),
      secondary: remapItem(entry.selected.secondary),
      throwable: remapItem(entry.selected.throwable),
    };
    setSelected(remapped);
    setActiveLoadoutId(entry.id);
    persistList(savedLoadouts, entry.id);
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
    if (sideMenuOpen)         { setSideMenuOpen(false); return; }
    if (boardPostOpen)        { setBoardPostOpen(false); return; }
    if (wbOwnedPopup)         { if (wbOwnedPopup !== "first") setWbOwnedPopup(null); return; }
    if (picker.open)          { setPicker(p=>({...p,open:false})); return; }
    if (tutorialStep >= 0)    { setTutorialStep(-1); return; }
    if (saveModal.open)       { setSaveModal(p=>({...p,open:false})); return; }
    if (manageFilterPopup)    { setManageFilterPopup(false); return; }
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

  /* ── 화면 알림(토스트) — 잠깐 표시 후 자동으로 사라짐 ── */
  const [toast, setToast] = useState(null);            // { text, kind:"ok"|"warn"|"err", key }
  const toastTimerRef = useRef(null);
  function showToast(text, kind="ok", ms=2200) {
    clearTimeout(toastTimerRef.current);
    setToast({ text, kind, key: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  }

  /* ── 공유 코드: 복사 ── */
  const [copiedCodeId,  setCopiedCodeId]  = useState(null);  // "복사됨" 표시 중인 대상 id ("__current__" = 현재 구성)
  const copiedTimerRef = useRef(null);
  function markCopied(id) {
    setCopiedCodeId(id);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedCodeId(null), 1500);
  }
  async function copyLoadoutCode(sel, name, markId) {
    const code = encodeLoadoutCode(sel, name);
    const ok = await copyText(code);
    if (!ok) { window.prompt("아래 코드를 복사해 주세요.", code); return; }
    markCopied(markId);
  }
  function handleCopyLoadoutCode(l) { copyLoadoutCode(l.selected, l.name, l.id); }
  /* ── 게시판 연동 ── */
  const [boardPostOpen, setBoardPostOpen] = useState(false);
  function handleOpenBoardPost() {
    if (!hasAnyItem(selected)) { showToast("선택된 장비가 없습니다.", "err"); return; }
    setBoardPostOpen(true);
  }
  function normalizeSel(sel) {
    const strat = (Array.isArray(sel?.stratagem) ? sel.stratagem : []).slice(0, 4);
    while (strat.length < 4) strat.push(null);
    return { stratagem:strat, armor:sel?.armor ?? null, primary:sel?.primary ?? null,
      secondary:sel?.secondary ?? null, throwable:sel?.throwable ?? null };
  }
  function loadSelectionToBuilder(sel, name) {
    setSelected(normalizeSel(sel));
    setActiveLoadoutId(null);
    setActivePage("loadout");
    try { window.scrollTo({ top:0, behavior:"smooth" }); } catch {}
    showToast(`"${name}" 로드아웃을 빌더로 불러왔습니다.`, "ok");
  }
  function saveSelectionToMine(sel, name) {
    const entry = { id:Date.now(), name: s(name) || `공유 로드아웃 ${savedLoadouts.filter(l=>!l.isDefault).length+1}`,
      selected: normalizeSel(sel), createdAt:new Date().toISOString() };
    const next = [...savedLoadouts, entry];
    setSavedLoadouts(next);
    persistList(next, activeLoadoutId);
    showToast(`"${entry.name}" 을(를) 저장된 로드아웃에 추가했습니다.`, "ok");
  }

  function handleCopyCurrentCode() {
    if (!hasAnyItem(selected)) { showToast("선택된 장비가 없습니다.", "err"); return; }
    const name = activeLoadoutId && activeLoadoutId !== "__default__" ? (activeLoadoutName ?? "") : "";
    copyLoadoutCode(selected, name, "__current__");
  }

  /* ── 공유 코드: 클립보드에서 바로 추가 ──
   * 클립보드 읽기가 막힌 환경(권한 거부/미지원)에서는 직접 붙여넣는 입력 칸을 대신 표시 */
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [importCode,       setImportCode]       = useState("");
  const [highlightId,      setHighlightId]      = useState(null);  // 추가 직후 강조할 로드아웃 id
  const WRONG_CODE_MSG = "알맞은 양식의 로드아웃 코드를 복사해주세요.";

  function importFromText(text) {
    if (!String(text ?? "").includes(LOADOUT_CODE_PREFIX)) { showToast(WRONG_CODE_MSG, "err"); return false; }
    try {
      const { name, selected:sel, missing } = decodeLoadoutCode(text, items);
      const n = savedLoadouts.filter(l=>!l.isDefault).length;
      const entry = {
        id: Date.now(),
        name: name || `공유 로드아웃 ${n+1}`,
        selected: sel,
        createdAt: new Date().toISOString(),
      };
      const next = [...savedLoadouts, entry];
      setSavedLoadouts(next);
      persistList(next, activeLoadoutId);
      resetManageFilters();            // 필터 때문에 새 항목이 안 보이는 상황 방지
      setHighlightId(entry.id);
      if (missing > 0) showToast(`"${entry.name}" 추가됨 — 찾을 수 없는 장비 ${missing}개는 비워 두었습니다.`, "warn", 3200);
      else             showToast(`"${entry.name}" 로드아웃을 추가했습니다.`, "ok");
      return true;
    } catch (e) {
      showToast(e?.message || WRONG_CODE_MSG, "err");
      return false;
    }
  }
  async function handlePasteImport() {
    let text = null;
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      text = await navigator.clipboard.readText();
    } catch {
      setManualImportOpen(true);
      showToast("클립보드를 읽을 수 없습니다. 아래 칸에 코드를 직접 붙여넣어 주세요.", "warn", 3200);
      return;
    }
    importFromText(text);
  }
  function handleManualImport() {
    if (!importCode.trim()) return;
    if (importFromText(importCode)) setImportCode("");
  }

  // 추가된 로드아웃 위치로 스크롤 + 2초 강조
  useEffect(() => {
    if (highlightId == null || !manageModal) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`.manageItem[data-loadout-id="${highlightId}"]`);
      el?.scrollIntoView({ behavior:"smooth", block:"center" });
    });
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [highlightId, manageModal]);

  // 관리 모달을 닫으면 입력/강조 초기화
  useEffect(() => {
    if (!manageModal) { setImportCode(""); setManualImportOpen(false); setHighlightId(null); setManageFilterPopup(false); }
  }, [manageModal]);

  const pickerItems     = useMemo(()=>itemsByType.get(picker.typeKey)??[],[itemsByType,picker.typeKey]);
  const isStratagemPicker = picker.slotKey.startsWith("stratagem:");
  const pickerTitle = useMemo(()=>{
    if (!picker.typeKey) return "";
    if (isStratagemPicker) return `스트라타젬 선택 (#${activeSlotIndex+1})`;
    return `${TYPE_LABEL_KO[picker.slotKey]??picker.slotKey} 선택`;
  },[picker.typeKey,picker.slotKey,isStratagemPicker,activeSlotIndex]);
  const isWeaponPicker = WEAPON_SLOT_KINDS.has(picker.slotKind);
  const deleteTarget   = deleteConfirm?savedLoadouts.find(l=>l.id===deleteConfirm):null;
  const isMobileUI     = typeof window !== "undefined" && window.innerWidth <= 700;

  return (
    <div className="appShell" onContextMenu={handleContextMenu}>
      {/* 상단 네비 — appWrap 바깥, 화면 전체 폭 */}
      <nav className="topNav">
        <div className="topNavInner">
          <div className="topNavTitle">
            SES 자기 결정의 전달자 <span className="topNavPatch">자유의 공백</span>
            <span className="topNavPageTabs">
              <button
                className={`topNavTab pageTab ${activePage==="loadout"?"active":""}`}
                type="button" onClick={()=>setActivePage("loadout")}
              >로드아웃 빌더</button>
              <button
                className={`topNavTab pageTab ${activePage==="random"?"active":""}`}
                type="button" onClick={goRandom}
              >무작위 로드아웃</button>
              <button
                className={`topNavTab pageTab ${activePage==="board"?"active":""} ${!boardVisited?"newGlow":""}`}
                type="button" onClick={()=>setActivePage("board")}
              >로드아웃 게시판{!boardVisited && <span className="newBadge">New</span>}</button>
            </span>
          </div>
          <div className="topNavTabs">
            <button className="topNavTab infoBtn" type="button"
              onClick={()=>setInfoModal(true)}
            >운용자 정보</button>
            <button className="topNavTab tutorialBtn" type="button"
              onClick={()=>setTutorialStep(0)}
              style={activePage!=="loadout" ? {display:"none"} : {}}
            >튜토리얼</button>
          </div>
          {/* 모바일: 사이드 메뉴 버튼 (페이지 이동 / 운용자 정보 / 튜토리얼) */}
          <button className={`topNavMenuBtn ${!boardVisited?"newGlow":""}`} type="button" aria-label="메뉴 열기" onClick={()=>setSideMenuOpen(true)}>
            {!boardVisited && <span className="newDot" aria-hidden="true" />}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── 모바일 사이드 메뉴 ── */}
      {sideMenuOpen && (
        <div className="sideMenuOverlay" onClick={()=>setSideMenuOpen(false)}
          onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); setSideMenuOpen(false); }}>
          <aside className="sideMenuPanel" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="메뉴">
            <div className="sideMenuHeader">
              <span className="sideMenuTitle">SES 자기 결정의 전달자</span>
              <button className="sideMenuClose" type="button" aria-label="메뉴 닫기" onClick={()=>setSideMenuOpen(false)}>&gt;&gt;</button>
            </div>
            <div className="sideMenuSectionLabel">페이지</div>
            <button type="button" className={`sideMenuItem ${activePage==="loadout"?"active":""}`}
              onClick={()=>{ setActivePage("loadout"); setSideMenuOpen(false); }}>로드아웃 빌더</button>
            <button type="button" className={`sideMenuItem ${activePage==="random"?"active":""}`}
              onClick={()=>{ if (activePage!=="random") goRandom(); setSideMenuOpen(false); }}>무작위 로드아웃</button>
            <button type="button" className={`sideMenuItem ${activePage==="board"?"active":""} ${!boardVisited?"newGlow":""}`}
              onClick={()=>{ setActivePage("board"); setSideMenuOpen(false); }}>
              로드아웃 게시판{!boardVisited && <span className="newBadge">New</span>}
            </button>
            <div className="sideMenuDivider" />
            <button type="button" className="sideMenuItem sideMenuItemInfo"
              onClick={()=>{ setSideMenuOpen(false); setInfoModal(true); }}>운용자 정보</button>
            {activePage==="loadout" && (
              <button type="button" className="sideMenuItem sideMenuItemTutorial"
                onClick={()=>{ setSideMenuOpen(false); setTutorialStep(0); }}>튜토리얼</button>
            )}
          </aside>
        </div>
      )}

      <div className="appWrap">
        {err && <div className="errorBox">에러: {err}</div>}

        {/* ── 로딩 화면 ── */}
        {isLoading && !err && (
          <div className="loadingScreen">
            <div className="loadingText">아군 구축함의 좌표 수신중...</div>
          </div>
        )}

        {/* ── 개인 로드아웃 ── */}
        {!isLoading && activePage==="loadout" && <div className="pagePersonal">
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
                  <div className="statsPanelTitle" style={{ display:"flex", alignItems:"center", gap:8 }}>
                  로드아웃 분석 Beta
                  <button type="button" onClick={() => setShowBetaNotice(true)} style={{ width:22, height:22, borderRadius:"50%", background:"rgba(250,204,21,.15)", border:"1px solid rgba(250,204,21,.6)", color:"#fde047", fontSize:12, fontWeight:900, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 8px rgba(253,224,71,.5), 0 0 18px rgba(253,224,71,.25)", animation:"betaBtnGlow 1.8s ease-in-out infinite", flexShrink:0, padding:0 }} title="로드아웃 분석 Beta 안내">!</button>
                </div>
                  <div className="statsGrid statsGridAnalysis">

                    {/* 로드아웃 성능 그래프 */}
                    <div className="statItem radarChartSection">
                      <LoadoutRadarChart selected={selected} requirements={requirements} flyingEnemies={flyingEnemies} structures={structures} />
                    </div>

                    {/* 로드아웃 구성 요구 사항 */}
                    <div className="statItem reqSection">
                      <div className="statLabel">로드아웃 구성 요구 사항</div>
                      <div className="statTraitList">
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
                <SelectedPanel selected={selected} activeLoadoutName={activeLoadoutName} tagInfo={tagInfo} />

                <div className="sideActions">
                  <div className="loadoutMgmtBtns">
                    <div className="lBtnSplitRow">
                      <button className="lBtn lBtnSave" onClick={handleSaveLoadout} type="button">현재 구성 저장</button>
                      <button
                        className={`lBtn lBtnCode ${copiedCodeId==="__current__"?"lBtnCodeDone":""}`}
                        onClick={handleCopyCurrentCode} type="button"
                      >{copiedCodeId==="__current__" ? "복사됨 ✓" : "현재 구성 코드 복사"}</button>
                    </div>
                    <button className="lBtn lBtnBoardPost" onClick={handleOpenBoardPost} type="button">현재 구성 게시하기</button>
                    <button className="lBtn lBtnManage"     onClick={()=>setManageModal(true)}                  type="button">저장된 로드아웃 관리</button>
                    <button className="lBtn lBtnExport"     onClick={()=>exportLoadoutPng(captureRef,selected,stats.wbSummary)} type="button">현재 구성 이미지로 내보내기</button>
                  </div>
                  <button className="lBtn lBtnResetDanger" onClick={()=>setResetConfirm(true)}                type="button">선택 사항 초기화</button>
                </div>
              </div>

            </div>{/* /layout */}
        </div>}

        {/* ── 로드아웃 게시판 ── */}
        {!isLoading && activePage==="board" && (
          <LoadoutBoard
            items={items}
            savedLoadouts={savedLoadouts}
            gasUrl={GAS_URL}
            isMobileUI={isMobileUI}
            onLoadToBuilder={loadSelectionToBuilder}
            onSaveToMine={saveSelectionToMine}
            showToast={showToast}
          />
        )}

        {/* ── 무작위 로드아웃 ── */}
        {!isLoading && activePage==="random" && (
          <div className="pageRandom">

            {/* 브라쉬 장군 팝업 — 클릭하면 서서히 사라짐 */}
            {heroPopup && (
              <div className={`randomHeroPopupOverlay ${heroPopupFading ? "fading" : ""}`} onClick={closeHeroPopup}>
                <div className="randomHeroPopup">
                  <img src="/brash.png" className="randomBrashImg" alt="브라쉬 장군" />
                  <div className="randomHeroText">
                    <p>어서 와라! 헬다이버,</p>
                    <p>자네의 임무 진행 능력에 한계를 확인하기 위해 더 큰 시련을 준비했다.</p>
                    <p><span className="randomHeroEmphasis">무작위 스트라타젬과 개인 장비로 투입하는 거다!</span></p>
                    <p>헬다이버에게 헤쳐나가지 못할 상황이 없음을 민주주의의 적들에게 똑똑히 보여줘라! 행운을 빈다.</p>
                  </div>
                  <div className="randomHeroPopupHint">클릭해서 닫기</div>
                </div>
              </div>
            )}

            {/* 무작위 선택 범위 옵션 */}
            <div className="randomModeSection">
              {[
                { key:"default",  label:"능력 한계 시험",           desc:"기본 옵션. 배낭이 중복되지 않는 선에서 무작위 스트라타젬이 선택됩니다." },
                { key:"chaos",    label:"대혼돈",                   desc:"배낭 스트라타젬이 중복될 수 있습니다." },
                { key:"classic",  label:"헬다이버즈 2 클래식",      desc:"채권 구성품이 포함되지 않습니다." },
                { key:"obsession",label:"집착",                     desc:"한 분류의 스트라타젬(공격/지원/방어)만으로 로드아웃이 구성됩니다." },
                { key:"olddays",  label:"\"그 시절\"을 기억하나?",  desc:"스트라타젬 슬롯 한 칸을 배제하고 로드아웃을 구성합니다." },
                { key:"joker",    label:"조커 뽑기",                desc:"무작위 로드아웃을 배정받고, 원하는 슬롯을 직접 골라 재배정합니다." },
                { key:"noat",     label:"대전차 고갈",              desc:"대전차 지원무기가 배제된 상태로 로드아웃을 구성합니다." },
              ].map(({ key, label, desc }) => {
                const active = randomMode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`randomModeBtn ${active ? "active" : ""}`}
                    onClick={() => { setRandomMode(key); setJokerTarget(null); }}
                  >
                    <span className="randomModeBtnLabel">{label}</span>
                    <span className="randomModeBtnDesc">{desc}</span>
                  </button>
                );
              })}
            </div>

            {/* 연출 오버레이 */}
            {randomPending && (
              <div className="randomPendingOverlay">
                <div className="randomPendingText">대혼돈에 대비하세요...</div>
              </div>
            )}

            {/* 무작위 버튼 */}
            <div className="randomBtnWrap">
              <button className="randomBtn" type="button" onClick={pickRandom} disabled={randomPending}>
                {randomPending ? "배정 중..." : "무작위 로드아웃 배정"}
              </button>
            </div>

            {/* 결과 */}
            {randomResult && !randomPending && (
              <div className="randomResult">
                <div className="randomResultTitle">아래의 준비를 요청합니다.</div>

                {/* 집착 — 선택된 분류 표시 (결과 생성 시점이 obsession일 때만) */}
                {resultMode === "obsession" && randomResult.obsessionType && (()=>{
                  const OBS_COLORS = {"공격":["#fe5f47","rgba(254,95,71,.15)","rgba(254,95,71,.40)"],"지원":["#bfe1f6","rgba(191,225,246,.15)","rgba(191,225,246,.40)"],"방어":["#d4edbc","rgba(212,237,188,.15)","rgba(212,237,188,.40)"]};
                  const [tc, bg, bc] = OBS_COLORS[randomResult.obsessionType] ?? ["#fff","rgba(255,255,255,.10)","rgba(255,255,255,.30)"];
                  return (
                    <div className="randomObsessionBadge" style={{color:tc, background:bg, borderColor:bc}}>
                      선택된 분류 : <strong>{randomResult.obsessionType}</strong>
                    </div>
                  );
                })()}

                {/* 조커 — 사용 안내 (결과 생성 시점이 joker일 때만) */}
                {resultMode === "joker" && (
                  <div className={`randomJokerHint ${jokerUsed ? "used" : ""}`}>
                    {jokerUsed
                      ? "✓ 교체 완료 — 이번 로드아웃의 슬롯 교체를 1회 사용했습니다."
                      : "슬롯을 클릭해 하나를 선택한 뒤 교체하기를 누르세요. (1회 한정)"}
                  </div>
                )}

                <div className="randomSection">
                  <div className="randomSectionLabel">스트라타젬</div>
                  <div className="randomStratRow">
                    {randomResult.strats.map((it, i) => {
                      const slotKey = `strat${i}`;
                      const isDisabled = !it && resultMode === "olddays";
                      const isEmpty = !it && !isDisabled;
                      const isJokerActive = resultMode === "joker" && !jokerUsed;
                      const isJokerSelected = resultMode === "joker" && jokerTarget === slotKey;
                      const isFlashing = jokerFlash === slotKey;
                      return (
                        <div
                          key={i}
                          className={`randomStratCard ${isDisabled ? "randomSlotDisabled" : ""} ${isJokerSelected ? "randomCardSelected" : ""} ${isJokerActive && it ? "randomCardClickable" : ""} ${isFlashing ? "randomCardFlash" : ""}`}
                          onClick={() => isJokerActive && it && setJokerTarget(jokerTarget === slotKey ? null : slotKey)}
                        >
                          {isDisabled ? (
                            <><div className="randomSlotX">✕</div><div className="randomStratName" style={{color:"rgba(255,255,255,.3)"}}>비활성 슬롯</div></>
                          ) : isEmpty ? (
                            <div className="randomStratIconEmpty" />
                          ) : (
                            <>
                              <RandIcon item={it} className="randomStratIcon" />
                              <div className="randomStratName">{it?.name_ko || it?.id || "—"}</div>
                              <div className="randomStratSub">{getSubType(it)||""}</div>
                            </>
                          )}
                          {isJokerSelected && !jokerUsed && (
                            <button type="button" className="randomCardRerollBtn" onClick={e=>{e.stopPropagation(); jokerReroll(slotKey);}}>교체하기</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="randomSection">
                  <div className="randomSectionLabel">개인 장비</div>
                  <div className="randomGearRow">
                    {[
                      { label:"방어구",   key:"armor",     item:randomResult.armor },
                      { label:"주무기",   key:"primary",   item:randomResult.primary },
                      { label:"보조무기", key:"secondary", item:randomResult.secondary },
                      { label:"투척무기", key:"throwable", item:randomResult.throwable },
                    ].map(({ label, key, item }) => {
                      const isJokerActive = resultMode === "joker" && !jokerUsed;
                      const isJokerSelected = resultMode === "joker" && jokerTarget === key;
                      const isFlashing = jokerFlash === key;
                      return (
                        <div
                          key={label}
                          className={`randomGearCard ${isJokerSelected ? "randomCardSelected" : ""} ${isJokerActive ? "randomCardClickable" : ""} ${isFlashing ? "randomCardFlash" : ""}`}
                          onClick={() => isJokerActive && setJokerTarget(jokerTarget === key ? null : key)}
                        >
                          <div className="randomGearLabel">{label}</div>
                          {item
                            ? <RandIcon item={item} className="randomGearIcon" />
                            : <div className="randomGearIconEmpty" />
                          }
                          <div className="randomGearName">{item?.name_ko || item?.id || "—"}</div>
                          {isJokerSelected && !jokerUsed && (
                            <button type="button" className="randomCardRerollBtn" onClick={e=>{e.stopPropagation(); jokerReroll(key);}}>교체하기</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── 신규 채권 미리보기 오버레이 ── */}
      {showWbNotice && !isLoading && ownedWb && (
        <WbNoticeOverlay
          onClose={() => setShowWbNotice(false)}
          isActivated={ownedWb.has(WB_NOTICE_DATA.name)}
          onActivate={() => { const n = new Set(ownedWb); n.add(WB_NOTICE_DATA.name); setOwnedWb(n); }}
        />
      )}

      {/* ── 소지 전쟁 채권 선택 팝업 (최초 1회 / 모바일 필터) ── */}
      <WbOwnedPopup
        open={!!wbOwnedPopup && !isLoading}
        mode={wbOwnedPopup ?? "edit"}
        allWb={allWbOptions}
        owned={ownedWb}
        items={items}
        onConfirm={confirmWbOwnedPopup}
        onClose={() => setWbOwnedPopup(null)}
      />

      {/* ── 로드아웃 분석 Beta 안내 모달 ── */}
      {showBetaNotice && (
        <div style={{ position:"fixed", inset:0, zIndex:2100, background:"rgba(0,0,0,.72)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setShowBetaNotice(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#1a1a1a", border:"1px solid rgba(248,113,113,.35)", borderRadius:16, padding:"28px 30px", maxWidth:560, width:"100%", display:"flex", flexDirection:"column", gap:16, boxShadow:"0 0 32px rgba(248,113,113,.18), 0 8px 40px rgba(0,0,0,.7)" }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#e9e9e9", letterSpacing:".02em" }}>로드아웃 분석 안내</div>
            <div style={{ fontSize:13, lineHeight:1.7, color:"rgba(255,255,255,.75)" }}>
              <span style={{ color:"#f87171", fontWeight:800, filter:"drop-shadow(0 0 4px rgba(248,113,113,.6))" }}>로드아웃 분석 기능은 Beta 기능으로, 완벽한 분석 기능을 보장하지 않습니다.</span>
              <br /><br />
              이후 게임의 밸런싱으로 인해 내부 데이터 값이 언제든 조정될 수 있으므로 어디까지나 참고 목적으로만 사용하시기 바랍니다.
            </div>
            <button type="button" onClick={() => setShowBetaNotice(false)} style={{ alignSelf:"flex-end", padding:"8px 24px", borderRadius:8, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.20)", color:"rgba(255,255,255,.75)", fontSize:13, fontWeight:700, cursor:"pointer" }}>확인</button>
          </div>
        </div>
      )}

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
                    <a className="infoLink" href="https://forms.gle/H6E3bH6z1KMRxxXWA" target="_blank" rel="noreferrer">구글 폼 바로가기</a>
                  </div>
                </div>
              </div>

              <div className="infoDivider" />

              <div className="infoBuildRow">
                <span className="infoBuildLabel">빌드 버전</span>
                <span className="infoBuildValue">ver 26.11.27</span>
              </div>
              <div className="infoBuildRow">
                <span className="infoBuildLabel">빌드 기준 최신 업데이트</span>
                <span className="infoBuildValue">ver 01.007.201 " Devoid of Liberty " <span className="infoSub">(자유의 공백)</span></span>
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
            <div className="manageImportRow">
              <div className="manageImportInputRow">
                <button className="manageImportBtn manageImportPasteBtn" type="button" onClick={handlePasteImport}>
                  복사한 코드로 로드아웃 추가
                </button>
              </div>
              {manualImportOpen && (
                <div className="manageImportInputRow">
                  <input
                    className="manageImportInput"
                    type="text"
                    placeholder={`로드아웃 코드 붙여넣기 (${LOADOUT_CODE_PREFIX}…)`}
                    value={importCode}
                    onChange={e=>setImportCode(e.target.value)}
                    onKeyDown={e=>{ if (e.key==="Enter") handleManualImport(); }}
                    spellCheck={false} autoComplete="off" autoFocus
                  />
                  <button className="manageImportBtn" type="button" onClick={handleManualImport} disabled={!importCode.trim()}>추가</button>
                </div>
              )}
            </div>
            {(manageSupportClassOptions.length>0 || manageSupportWeaponOptions.length>0 || manageWeaponTypeOptions.length>0) && (
              isMobileUI ? (
                /* 모바일: 필터 팝업 열기 / 해제 버튼 */
                <div className="manageFilterRow manageFilterRowMobile">
                  <button className="manageFilterOpenBtn" type="button" onClick={()=>setManageFilterPopup(true)}>
                    필터 적용{manageFilterCount>0 && <span className="manageFilterCount">{manageFilterCount}</span>}
                  </button>
                  <button className="manageFilterReset" type="button" onClick={resetManageFilters} disabled={!manageFilterActive}>필터 해제</button>
                </div>
              ) : (
              <div className="manageFilterRow">
                <FilterSelect
                  label="지원무기 대분류"
                  value={filterSupportClass}
                  options={manageSupportClassOptions}
                  onChange={setFilterSupportClass}
                  allLabel="대분류 전체"
                />
                <FilterSelect
                  label={filterSupportClass || "지원무기"}
                  value={filterSupportWeapon}
                  options={manageSupportWeaponOptions}
                  onChange={setFilterSupportWeapon}
                  allLabel="소분류"
                />
                <FilterSelect
                  label="주무장 소분류"
                  value={filterWeaponType}
                  options={manageWeaponTypeOptions}
                  onChange={setFilterWeaponType}
                  allLabel="주무장 전체"
                />
                {manageFilterActive && (
                  <button className="manageFilterReset" type="button" onClick={resetManageFilters}>필터 초기화</button>
                )}
              </div>
              )
            )}

            {/* 모바일 필터 팝업 — 선택 즉시 목록에 반영 */}
            {manageFilterPopup && (
              <div className="wbOwnedOverlay"
                onClick={e=>{ e.stopPropagation(); setManageFilterPopup(false); }}
                onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); setManageFilterPopup(false); }}>
                <div className="wbOwnedCard manageFilterPopupCard" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true">
                  <div className="wbOwnedHeader">
                    <div className="wbOwnedTitle">저장된 로드아웃 필터</div>
                    <div className="wbOwnedDesc">조건에 맞는 로드아웃 {filteredSavedLoadouts.length}개</div>
                  </div>
                  <div className="manageFilterPopupBody">
                    <div className="manageFilterPopupField">
                      <div className="filterTitle">지원무기 대분류</div>
                      <FilterSelect label="지원무기 대분류" value={filterSupportClass} options={manageSupportClassOptions}
                        onChange={setFilterSupportClass} allLabel="대분류 전체" />
                    </div>
                    <div className="manageFilterPopupField">
                      <div className="filterTitle">지원무기 소분류</div>
                      <FilterSelect label={filterSupportClass || "지원무기 소분류"} value={filterSupportWeapon} options={manageSupportWeaponOptions}
                        onChange={setFilterSupportWeapon} allLabel="소분류" />
                    </div>
                    <div className="manageFilterPopupField">
                      <div className="filterTitle">주무장 소분류</div>
                      <FilterSelect label="주무장 소분류" value={filterWeaponType} options={manageWeaponTypeOptions}
                        onChange={setFilterWeaponType} allLabel="주무장 전체" />
                    </div>
                  </div>
                  <div className="wbOwnedActions">
                    <button className="wbOwnedCancel" type="button" onClick={resetManageFilters} disabled={!manageFilterActive}>필터 해제</button>
                    <button className="wbOwnedConfirm" type="button" onClick={()=>setManageFilterPopup(false)}>적용</button>
                  </div>
                </div>
              </div>
            )}
            <div className="manageModalList">
              {savedLoadouts.length===0&&<div className="manageEmpty">저장된 로드아웃이 없습니다.</div>}
              {savedLoadouts.length>0&&filteredSavedLoadouts.length===0&&<div className="manageEmpty">필터에 맞는 로드아웃이 없습니다.</div>}
              {filteredSavedLoadouts.map(l=>{
                const isActive=l.id===activeLoadoutId;
                const isEditing=editingId===l.id;
                const isDragging=draggingLoadoutId===l.id;
                const sw=getSupportWeaponInfo(l.selected);
                const primaryName=s(l.selected?.primary?.name_ko||l.selected?.primary?.id||"");
                const pos=userLoadoutPositions.get(l.id);
                const isFirst=pos===1;
                const isLast=pos===userLoadoutPositions.size;
                return (
                  <div
                    key={l.id}
                    data-loadout-id={l.id}
                    className={`manageItem ${isActive?"manageItemActive":""} ${isDragging?"manageItemDragging":""} ${highlightId===l.id?"manageItemHighlight":""}`}
                    style={{touchAction:isDragging?"none":"pan-y"}}
                    onPointerDown={e=>handleLoadoutRowPointerDown(e,l.id,l.isDefault)}
                    onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); }}
                    title={l.isDefault||isMobileUI?undefined:"클릭한 채로 끌어서 순서 변경"}
                  >
                    {!l.isDefault ? (
                      <div className="managePositionStack">
                        {isMobileUI && (
                          <button
                            type="button" className="manageMoveBtn"
                            onClick={e=>{ e.stopPropagation(); moveLoadout(l.id,-1); }}
                            disabled={isFirst}
                            title="위로 이동"
                          >▲</button>
                        )}
                        {positionEditId===l.id ? (
                          <input
                            type="number"
                            className="managePositionInput"
                            value={positionEditValue}
                            onChange={e=>setPositionEditValue(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter") commitPositionEdit(l.id); if(e.key==="Escape") cancelPositionEdit(); }}
                            onBlur={()=>commitPositionEdit(l.id)}
                            onClick={e=>e.stopPropagation()}
                            min={1} max={userLoadoutPositions.size}
                            autoFocus
                          />
                        ) : (
                          <button
                            className="managePositionBadge"
                            onClick={e=>{ e.stopPropagation(); startPositionEdit(l.id); }}
                            type="button"
                            title="순서 번호를 입력해서 이 위치로 이동"
                          >{pos}</button>
                        )}
                        {isMobileUI && (
                          <button
                            type="button" className="manageMoveBtn"
                            onClick={e=>{ e.stopPropagation(); moveLoadout(l.id,1); }}
                            disabled={isLast}
                            title="아래로 이동"
                          >▼</button>
                        )}
                      </div>
                    ) : (
                      <span className="managePositionSpacer" />
                    )}

                    {sw.mode==="none" && <div className="manageSupportIconLarge manageSupportIconEmpty" title="지원무기 없음">지원무기<br/>없음</div>}
                    {sw.mode==="disposableOnly" && <div className="manageSupportIconLarge manageSupportIconTextLarge" title="일회성 지원무기 로드아웃">일회성<br/>로드아웃</div>}
                    {sw.mode==="main" && (
                      <div className="manageSupportIconLarge">
                        <RandIcon item={{ icon:sw.icon, sheet:sw.sheet, id:sw.itemId, name_ko:sw.name }} className="manageSupportIconLargeImg" />
                      </div>
                    )}

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
                      {!isEditing&&(
                        <div className="manageSupportTextRow">
                          {sw.mode==="none" && <span className="manageSupportNone">지원무기 없음</span>}
                          {sw.mode==="disposableOnly" && <span className="manageSupportName">일회성 지원무기 로드아웃</span>}
                          {sw.mode==="main" && (
                            <>
                              <span className="manageSupportName">{sw.name}</span>
                              {sw.extraCount>0 && <span className="manageSupportExtra">+{sw.extraCount}</span>}
                            </>
                          )}
                          {manageFilterActive && (
                            <span className="manageWeaponPrimaryName">· 주무기: {primaryName||"미선택"}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {!isEditing&&(isMobileUI ? (
                      /* 모바일: 우측 소형 아이콘 버튼 (코드 복사 / 불러오기 / 삭제) */
                      <div className="manageItemIconActions">
                        {!l.isDefault&&(
                          <button
                            className={`manageIconBtn manageIconBtnCode ${copiedCodeId===l.id?"done":""}`}
                            onClick={()=>handleCopyLoadoutCode(l)} type="button"
                            title="코드 복사" aria-label="코드 복사"
                          >{copiedCodeId===l.id ? <IconCheck/> : <IconCopy/>}</button>
                        )}
                        <button className="manageIconBtn manageIconBtnLoad" onClick={()=>handleLoadLoadout(l)} type="button"
                          title="불러오기" aria-label="불러오기"><IconLoad/></button>
                        {!l.isDefault&&(
                          <button className="manageIconBtn manageIconBtnDel" onClick={()=>requestDelete(l.id)} type="button"
                            title="삭제" aria-label="삭제"><IconTrash/></button>
                        )}
                      </div>
                    ) : (
                      <div className="manageItemActions">
                        <button className="manageBtnLoad" onClick={()=>handleLoadLoadout(l)} type="button">불러오기</button>
                        {!l.isDefault&&(
                          <div className="manageItemActionsSub">
                            <button
                              className={`manageBtnCode ${copiedCodeId===l.id?"manageBtnCodeDone":""}`}
                              onClick={()=>handleCopyLoadoutCode(l)} type="button"
                              title="공유 코드 복사"
                            >{copiedCodeId===l.id ? "복사됨 ✓" : "코드 복사"}</button>
                            <button className="manageBtnDel" onClick={()=>requestDelete(l.id)} type="button">삭제</button>
                          </div>
                        )}
                      </div>
                    ))}
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

      {/* ── 현재 구성 게시 모달 (빌더) ── */}
      <BoardPostModal
        open={boardPostOpen}
        source="current"
        selected={selected}
        defaultName={activeLoadoutId && activeLoadoutId !== "__default__" ? (activeLoadoutName ?? "") : ""}
        gasUrl={GAS_URL}
        onClose={()=>setBoardPostOpen(false)}
        onPosted={()=>{ setBoardPostOpen(false); showToast("정상적으로 게시됐습니다.", "ok"); }}
      />

      {/* ── 화면 알림 ── */}
      {toast && (
        <div key={toast.key} className={`appToast appToast_${toast.kind}`} role="status">{toast.text}</div>
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
        ownedWb={ownedWb}
        onOpenWbPopup={() => setWbOwnedPopup("edit")}
      />
    </div>
  );
}
