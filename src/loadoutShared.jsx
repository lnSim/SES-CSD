/* ══════════════════════════════════════════════════════════════
 *  loadoutShared.jsx — 빌더(App)와 게시판(LoadoutBoard)이 함께 쓰는 함수/컴포넌트
 *  (로드아웃 코드, 아이콘, 필터 드롭다운, 전쟁 채권 스타일, 지원무기 분류 등)
 * ══════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withAssetVersion, DEFAULT_ICON } from "./assetVersion";

export const s = (v) => String(v ?? "").trim();
export const getSubType = (it) => s(it?.subType ?? it?.subtype);
const SUBTYPE_BACKPACK_WEAPON = "지원배낭 무기";

export function normalizeIcon(it) {
  const id=s(it?.id), raw=s(it?.icon);
  if (raw) return /^https?:\/\//i.test(raw)?raw:raw.startsWith("/")?raw:`/${raw}`;
  if (!id) return DEFAULT_ICON;
  return `/icons/${s(it?.sheet||it?.sheetName||it?.type)||"misc"}/${id}.png`;
}

/* ── 무작위 결과 카드용 이미지 컴포넌트 (sheet 기반 단일 확장자) ── */
export function RandIcon({ item, className, style={} }) {
  const sheet   = s(item?.sheet || item?.sheetName || item?.type);
  const ext     = ["stratagem","booster"].includes(sheet.toLowerCase()) ? ".svg" : ".png";  // 스트라타젬·부스터는 svg
  const base    = s(item?.icon) || normalizeIcon(item);
  const primary = base.replace(/\.(png|svg|webp)$/i, ext);
  const [useDefault, setUseDefault] = useState(false); // 이미지 없음 → default.png로 대체
  const [dead, setDead] = useState(false);
  useEffect(()=>{ setUseDefault(false); setDead(false); }, [primary]);
  if (dead) return (
    <div className={className} style={{ display:"flex", alignItems:"center", justifyContent:"center",
      color:"rgba(255,255,255,.40)", fontSize:11, textAlign:"center", lineHeight:1.3, ...style }}>
      이미지<br/>준비중
    </div>
  );
  return (
    <img src={withAssetVersion(useDefault ? DEFAULT_ICON : primary)} alt={s(item?.name_ko)||s(item?.id)}
      className={className} style={style} draggable={false}
      loading="lazy" decoding="async"
      onError={()=>{ if (!useDefault && primary !== DEFAULT_ICON) setUseDefault(true); else setDead(true); }}
    />
  );
}

/* ── 필터용 커스텀 드롭다운 (사이트 시그니처 다크+옐로우 테마) ──
 * 데스크톱: 버튼 아래 패널 / 모바일: 하단 시트 팝업 */
export function FilterSelect({ label, value, options, onChange, allLabel }) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState(null); // { left, width, maxHeight, top?, bottom? }
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 700;

  useEffect(() => {
    if (!open || isMobile) return;
    const onOutside = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)
          && !(panelRef.current && panelRef.current.contains(e.target))) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("touchstart", onOutside, { capture:true, passive:true });
    return () => {
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("touchstart", onOutside, true);
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return;
    function updatePos() {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const panelWidth = Math.max(r.width, 200);
      let left = Math.min(r.left, vw - panelWidth - 8);
      left = Math.max(8, left);

      const spaceBelow = vh - r.bottom - 8;
      const spaceAbove = r.top - 8;

      if (spaceBelow < 160 && spaceAbove > spaceBelow) {
        setPanelPos({ left, width:panelWidth, maxHeight:Math.max(120,spaceAbove), bottom: vh - r.top + 6, top:null });
      } else {
        setPanelPos({ left, width:panelWidth, maxHeight:Math.max(120,spaceBelow), top: r.bottom + 6, bottom:null });
      }
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, isMobile]);

  function selectValue(v) { onChange(v); setOpen(false); }
  const currentLabel = value || allLabel;

  return (
    <div className="filterSelectWrap" ref={wrapRef}>
      <button
        type="button"
        className={`filterSelectBtn ${value?"filterSelectBtnActive":""}`}
        onClick={()=>setOpen(o=>!o)}
      >
        <span className="filterSelectBtnLabel">{currentLabel}</span>
        <span className="filterSelectBtnArrow">▾</span>
      </button>

      {/* 패널/시트는 body에 렌더 — 고정 헤더·하단 바 등 다른 쌓임 영역에 가려지거나 기준이 바뀌는 문제 방지 */}
      {open && !isMobile && panelPos && createPortal(
        <div
          ref={panelRef}
          className="filterSelectPanel"
          style={{
            position:"fixed", left:panelPos.left, width:panelPos.width, maxHeight:panelPos.maxHeight,
            ...(panelPos.top!=null ? { top:panelPos.top } : { bottom:panelPos.bottom }),
          }}
        >
          <button type="button" className={`filterSelectOption ${!value?"filterSelectOptionActive":""}`} onClick={()=>selectValue("")}>{allLabel}</button>
          {options.map(opt=>(
            <button key={opt} type="button" className={`filterSelectOption ${value===opt?"filterSelectOptionActive":""}`} onClick={()=>selectValue(opt)}>{opt}</button>
          ))}
        </div>
      , document.body)}

      {open && isMobile && createPortal(
        <div className="filterSheetOverlay" onClick={()=>setOpen(false)}>
          <div className="filterSheetCard" onClick={e=>e.stopPropagation()}>
            <div className="filterSheetHeader">
              <span className="filterSheetTitle">{label}</span>
              <button type="button" className="modalClose" onClick={()=>setOpen(false)}>닫기</button>
            </div>
            <div className="filterSheetList">
              <button type="button" className={`filterSheetOption ${!value?"filterSheetOptionActive":""}`} onClick={()=>selectValue("")}>{allLabel}</button>
              {options.map(opt=>(
                <button key={opt} type="button" className={`filterSheetOption ${value===opt?"filterSheetOptionActive":""}`} onClick={()=>selectValue(opt)}>{opt}</button>
              ))}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

/* ── 저장된 로드아웃의 지원무기 요약 정보 계산 ──
 * mode: "none"           → 지원무기 미선택
 *       "main"            → 일반/배낭형 지원무기(또는 일회용 1개 단독) 표시
 *       "disposableOnly"  → 일회용 지원무기만 2개 이상 선택된 경우
 */
export const SUPPORT_WEAPON_SUBTYPES_ALL = new Set(["지원무기","일회용 지원무기",SUBTYPE_BACKPACK_WEAPON]);
export function getSupportWeaponInfo(sel) {
  const stratItems = (Array.isArray(sel?.stratagem)?sel.stratagem:[]).filter(Boolean);
  const supportItems = stratItems.filter(it=>SUPPORT_WEAPON_SUBTYPES_ALL.has(getSubType(it)));
  if (supportItems.length===0) return { mode:"none" };

  const disposables    = supportItems.filter(it=>getSubType(it)==="일회용 지원무기");
  const nonDisposables = supportItems.filter(it=>getSubType(it)!=="일회용 지원무기");

  if (nonDisposables.length>0) {
    const main = nonDisposables[0];
    return {
      mode:"main",
      icon: main.icon, sheet: main.sheet, itemId: main.id,
      name: s(main.name_ko||main.id),
      extraCount: disposables.length,
    };
  }
  if (disposables.length===1) {
    const main = disposables[0];
    return {
      mode:"main",
      icon: main.icon, sheet: main.sheet, itemId: main.id,
      name: s(main.name_ko||main.id),
      extraCount: 0,
    };
  }
  return { mode:"disposableOnly", count:disposables.length };
}

/* ── 관리 모달 필터: 지원무기 대분류 ──
 * 이름(name_ko)에 아래 키워드가 들어가면 대전차 지원무기, 나머지 지원무기는 비대전차.
 * ★ 대전차 지원무기 추가 시 키워드만 추가 */
export const AT_SUPPORT_NAME_KEYWORDS = [
  "무반동포","스피어","퀘이사","멜타","벽 폭파 망치","C4","에이펙스",
  "코만도","일회성 대전차","솔로 사일로","평탄화",
];
export const SUPPORT_CLASS_AT    = "대전차 지원무기";
export const SUPPORT_CLASS_NONAT = "비대전차 지원무기";
export const SUPPORT_CLASS_ORDER = [SUPPORT_CLASS_AT, SUPPORT_CLASS_NONAT];
export function getSupportClass(it) {
  const name = s(it?.name_ko).toUpperCase();
  return AT_SUPPORT_NAME_KEYWORDS.some(k => name.includes(k.toUpperCase())) ? SUPPORT_CLASS_AT : SUPPORT_CLASS_NONAT;
}

/* ── 관리 모달 필터: 주무장 소분류 표시 순서 (띄어쓰기 무시 비교) ── */
export const WEAPON_TYPE_ORDER = ["돌격소총","지정사수소총","저격소총","기관단총","산탄총","폭발","에너지","특수"];
export function sortWeaponTypes(list) {
  const rank = (wt) => { const i = WEAPON_TYPE_ORDER.indexOf(s(wt).replace(/\s+/g,"")); return i === -1 ? 999 : i; };
  return [...list].sort((a,b) => (rank(a) - rank(b)) || a.localeCompare(b,"ko"));
}

/* ── 로드아웃 공유 코드 ──
 * 형식: "SES-" + base64url( "v1|스트라타젬4개(,구분)|방어구|주무기|보조무기|투척무기|이름" )
 * - 아이템 ID만 담으므로 짧고, 불러올 때 최신 GAS 데이터로 다시 매핑됨
 * - 게시판(3단계)에서도 같은 형식을 사용
 */
export const LOADOUT_CODE_PREFIX = "SES-";
export const LOADOUT_CODE_NAME_MAX = 30;

export function encodeLoadoutCode(sel, name = "") {
  const id = (it) => s(it?.id);
  const strats = (Array.isArray(sel?.stratagem) ? sel.stratagem : []).slice(0, 4);
  while (strats.length < 4) strats.push(null);
  const safeName = s(name).replace(/\|/g, " ").slice(0, LOADOUT_CODE_NAME_MAX);
  const raw = ["v1", strats.map(id).join(","),
    id(sel?.armor), id(sel?.primary), id(sel?.secondary), id(sel?.throwable), safeName].join("|");
  const bytes = new TextEncoder().encode(raw);          // 한글 이름 대응 (UTF-8)
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return LOADOUT_CODE_PREFIX + btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

/* 반환: { name, selected, missing } — missing: DB에서 찾지 못한 ID 개수
 * 실패 시 Error(사용자에게 보여줄 한국어 메시지) */
export function decodeLoadoutCode(input, items) {
  let code = String(input ?? "").replace(/\s+/g, "");
  const p = code.indexOf(LOADOUT_CODE_PREFIX);
  if (p === -1) throw new Error("올바른 로드아웃 코드가 아닙니다.");
  code = code.slice(p + LOADOUT_CODE_PREFIX.length);

  let raw;
  try {
    let b64 = code.replace(/-/g,"+").replace(/_/g,"/");
    while (b64.length % 4) b64 += "=";
    raw = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  } catch { throw new Error("코드가 손상되었습니다. 전체를 다시 복사해 주세요."); }

  const parts = raw.split("|");
  if (parts[0] !== "v1" || parts.length < 6) throw new Error("지원하지 않는 코드 형식입니다.");
  const [, strats, armor, primary, secondary, throwable, name = ""] = parts;

  const byId = new Map(items.map(it => [it.id, it]));
  let missing = 0, found = 0;
  const get = (id) => {
    if (!id) return null;
    const it = byId.get(id);
    if (it) { found++; return it; }
    missing++; return null;
  };
  const stratArr = strats.split(",").slice(0, 4).map(get);
  while (stratArr.length < 4) stratArr.push(null);
  const selected = {
    stratagem: stratArr,
    armor: get(armor), primary: get(primary), secondary: get(secondary), throwable: get(throwable),
  };
  if (found === 0) throw new Error("코드에 포함된 장비를 찾을 수 없습니다.");
  return { name: s(name).slice(0, LOADOUT_CODE_NAME_MAX), selected, missing };
}

/* ── 관리 모달 모바일 아이콘 (stroke = currentColor) ── */
export const ICON_PROPS = { width:16, height:16, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor",
  strokeWidth:2, strokeLinecap:"round", strokeLinejoin:"round", "aria-hidden":true };
export const IconCopy  = () => (<svg {...ICON_PROPS}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>);
export const IconLoad  = () => (<svg {...ICON_PROPS}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/></svg>);
export const IconTrash = () => (<svg {...ICON_PROPS}><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>);
export const IconCheck = () => (<svg {...ICON_PROPS}><path d="M5 12l5 5L20 7"/></svg>);
export const IconSave  = () => (<svg {...ICON_PROPS}><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/></svg>);
export const IconHeart = ({ filled = false }) => (
  <svg {...ICON_PROPS} fill={filled ? "currentColor" : "none"}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>
);

/* 클립보드 복사 (구형 브라우저/비보안 컨텍스트 대비 fallback) */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* 비워둔 슬롯 표시 문구 — PNG 내보내기 / 게시판 공통 */
export const EMPTY_SLOT_LABEL = "자유";

/* ── 전쟁 채권 배지 스타일 ── */
/* ── 전쟁 채권 표시 순서 (armor 시트 G열 기준 — 파일 업로드 후 갱신 필요) ── */
export const WB_ORDER = [
  "헬다이버 출동!","결연한 베테랑","최첨단","민주적 폭파","극지의 애국자",
  "독사 특공대","자유의 불꽃","화학 요원","진리의 집행자","도시 전설",
  "자유의 종복","정의의 경계선","의장의 달인","법의 위력","대조군",
  "먼지 폭풍","금사 특공대","존재하지 않는 부대","공성 파괴자",
  "민주적 궤도 강하 타격대","정의로운 망령","견고한 참호 사단","외계 전문가","카스텔란의 신조",
  "철갑의 민주주의","권위의 가늠자",
];
export function sortByWbOrder(entries) {
  return [...entries].sort(([a],[b]) => {
    const ai = WB_ORDER.indexOf(a), bi = WB_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

export const WB_STYLES = {
  "헬다이버 출동!":        { color:"#f7f352", background:"#0e2c2e", borderColor:"rgba(247,243,82,.35)" },
  "결연한 베테랑":         { color:"#ffffff", background:"#ea630f", borderColor:"rgba(255,255,255,.3)" },
  "최첨단":                { color:"#ffffff", background:"#0044ab", borderColor:"rgba(96,216,255,.50)", textShadow:"0 0 10px #40efff" },
  "민주적 폭파":           { color:"#ef8f00", background:"#920f00", borderColor:"rgba(239,143,0,.35)", textShadow:"0 0 6px #680800, 0 0 2px #680800" },
  "극지의 애국자":         { color:"#ffffff", background:"#3eb0e8", borderColor:"rgba(255,255,255,.3)", textShadow:"0 0 6px #2c7fbf, 0 0 2px #2c7fbf" },
  "독사 특공대":           { color:"#ffffff", background:"#103318", borderColor:"rgba(255,255,255,.2)" },
  "자유의 불꽃":           { color:"#ff7918", background:"#562f18", borderColor:"rgba(255,121,24,.35)" },
  "화학 요원":             { color:"#d3ec18", background:"#3c4209", borderColor:"rgba(211,236,24,.3)"  },
  "진리의 집행자":         { color:"#b50000", background:"#dcc9c9", borderColor:"rgba(181,0,0,.4)"     },
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
  "해방절 보상":            { color:"#b0deef", background:"#0a1c2c", borderColor:"#2071aa", textShadow:"0 0 8px #2071aa" },
  "슈퍼스토어 구매":        { color:"#00f6ff", background:"#001c2e", borderColor:"rgba(0,246,255,.65)", textShadow:"0 0 8px rgba(0,246,255,.5)" },
  "견고한 참호 사단":       { color:"#c7b243", background:"#040200", borderColor:"#978642"              },
  "외계 전문가":            { color:"#654632", background:"#fffbe5", borderColor:"#c4a882"              },
  "카스텔란의 신조":        { color:"#dfdfe1", background:"linear-gradient(180deg, #3a5568 0%, #203a49 100%)", borderColor:"#f50301" },
  "철갑의 민주주의":        { color:"#dddac2", background:"#41494f", borderColor:"#262b31"              },
  "권위의 가늠자":          { color:"#dedfb5", background:"repeating-linear-gradient(135deg, #0e200e 0px, #0e200e 6px, #4a5a32 6px, #4a5a32 8px)", borderColor:"#4a5a32", textShadow:"0 0 4px #0e200e, 0 0 2px #0e200e" },
};
export function getWbBadgeStyle(wb) {
  return WB_STYLES[wb] ?? { color:"rgba(255,255,255,.8)", background:"rgba(255,255,255,.07)", borderColor:"rgba(255,255,255,.18)" };
}

/* ── 필요 전쟁 채권 요약 (헬다이버 출동! 포함, 기본 제외, 슈퍼스토어는 맨 뒤) ── */
export function computeWbSummary(sel) {
  const wbPageMap = new Map();
  let hasSuperStore = false;
  const all = [sel?.armor, sel?.primary, sel?.secondary, sel?.throwable,
    ...(Array.isArray(sel?.stratagem) ? sel.stratagem : [])].filter(Boolean);
  for (const it of all) {
    const wb = s(it?.wbrequirement);
    if (!wb || wb === "기본") continue;
    if (wb.includes("슈퍼") && wb.includes("스토어")) { hasSuperStore = true; continue; }
    const page = Number(s(it?.unlock)) || 0;
    const prev = wbPageMap.get(wb) ?? -1;
    if (page > prev) wbPageMap.set(wb, page);
  }
  const wbSummary = sortByWbOrder([...wbPageMap.entries()]).map(([wb, page]) => ({ wb, page }));
  if (hasSuperStore) wbSummary.push({ wb:"슈퍼스토어 구매", page:0 });
  return wbSummary;
}

/* ── 로드아웃(selected) 기준 지원무기 / 주무장 정보 (관리창·게시판 필터 공용) ── */
export function getSupportItemsOfSel(sel) {
  return (Array.isArray(sel?.stratagem) ? sel.stratagem : []).filter(Boolean)
    .filter(it => SUPPORT_WEAPON_SUBTYPES_ALL.has(getSubType(it)));
}
export function getSupportNamesOfSel(sel, cls = "") {
  return getSupportItemsOfSel(sel)
    .filter(it => !cls || getSupportClass(it) === cls)
    .map(it => s(it.name_ko || it.id)).filter(Boolean);
}
export function getWeaponTypeOfSel(sel) { return s(sel?.primary?.weaponType); }
export function hasAnyItem(sel) {
  return (Array.isArray(sel?.stratagem) && sel.stratagem.some(Boolean)) ||
    ["armor","primary","secondary","throwable"].some(k => sel?.[k]);
}

/* ── 팩션 (게시판) ──
 * ★ 아이콘 파일명이 다르면 icon 경로만 수정. 파일이 없으면 아이콘 없이 강조색 칩으로 표시 */
export const BOARD_FACTIONS = ["테르미니드","오토마톤","일루미닛","팩션 범용"];
/* 이전 명칭 "전체 공용" → "팩션 범용" */
export const normalizeFaction = (f) => (f === "전체 공용" ? "팩션 범용" : f);
export const FACTION_META = {
  // 색상/아이콘은 레이더 차트(LoadoutRadarChart RACE_COLORS / RACE_BASE_IMG)와 동일
  // ※ 서버(Vercel)는 파일명 대소문자를 구분 — Illuminate.svg 는 대문자 I
  "테르미니드": { color:"#ffc100", icon:"/icons/race/terminid.svg",
                 // 글자: 노랑을 살짝 누그러뜨린 황금색 + 은은한 글로우
                 textColor:"#f2c85b", textShadow:"0 0 6px rgba(200,105,20,.80), 0 0 14px rgba(200,105,20,.40)" },  // 글로우: 명도를 낮춘 주황
  "오토마톤":   { color:"#eb343a", icon:"/icons/race/automaton.svg",
                 // 글자: 어두운 배경에서 읽히도록 밝힌 산호빛 빨강 + 은은한 글로우
                 textColor:"#f2696d", textShadow:"0 0 6px rgba(235,52,58,.75), 0 0 14px rgba(235,52,58,.35)" },
  "일루미닛":   { color:"#a419f8", icon:"/icons/race/Illuminate.svg",
                 // 글자: 상단 업데이트명(자유의 공백)과 같은 밝은 보라 + 글로우
                 textColor:"#bf5efa", textShadow:"0 0 6px rgba(118,30,186,.90), 0 0 14px rgba(118,30,186,.50)" },   // 글로우: 어두운 보라
  "팩션 범용":  { color:"#a9a9a9", activeColor:"#f0c400", icon:null,     // 선택 시 노란색 강조
                 badge:{ color:"#f0c400", borderColor:"rgba(240,196,0,.65)", background:"#000" } },  // 카드 배지: 검은 배경 + 노란 글자/테두리
};
/* 팩션 선택 버튼 (레이더 차트 종족 버튼과 같은 pill 스타일: 비활성 회색 / 활성 팩션색) */
export function FactionPill({ faction, active, onClick, size = "md" }) {
  const meta = faction ? (FACTION_META[faction] ?? FACTION_META["팩션 범용"]) : { color:"#f0c400", icon:null };
  const activeColor = meta.activeColor ?? meta.color;
  const [iconOk, setIconOk] = useState(!!meta.icon);
  useEffect(() => { setIconOk(!!meta.icon); }, [meta.icon]);
  return (
    <button type="button" role="tab" aria-selected={!!active} onClick={onClick}
      className={`factionPill factionPill_${size} ${active ? "on" : ""}`}
      style={active
        ? (meta.badge ?? { borderColor:`${activeColor}73`, background:`${activeColor}1f`, color:meta.textColor ?? activeColor, textShadow:meta.textShadow })
        : undefined}>
      {iconOk && (
        <img src={withAssetVersion(meta.icon)} alt="" aria-hidden="true" className="factionPillIcon"
          onError={() => setIconOk(false)} draggable={false} />
      )}
      {faction || "전체"}
    </button>
  );
}
export function FactionBadge({ faction, size = "md" }) {
  const meta = FACTION_META[normalizeFaction(faction)] ?? FACTION_META["팩션 범용"];
  const [iconOk, setIconOk] = useState(!!meta.icon);
  useEffect(() => { setIconOk(!!meta.icon); }, [meta.icon]);
  return (
    <span className={`factionBadge factionBadge_${size} ${iconOk ? "" : "factionBadgeNoIcon"}`}
      style={meta.badge ?? { color:meta.textColor ?? meta.color, textShadow:meta.textShadow, borderColor:`${meta.color}88`, background:`${meta.color}1a` }}>
      {iconOk && (
        <img src={withAssetVersion(meta.icon)} alt="" aria-hidden="true" className="factionBadgeIcon"
          onError={() => setIconOk(false)} draggable={false} />
      )}
      <span>{normalizeFaction(faction) || "팩션 범용"}</span>
    </span>
  );
}

/* 시트 수식 방지용으로 붙은 앞쪽 ' 제거 (=,+,-,@ 앞에 붙은 경우만) */
export function cleanSheetText(v) {
  const str = String(v ?? "");
  return /^'[=+\-@]/.test(str) ? str.slice(1) : str;
}
