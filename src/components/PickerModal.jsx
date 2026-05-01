import { useEffect, useMemo, useRef, useState } from "react";

/* ── 전쟁 채권 표시 순서 ── */
const WB_ORDER = [
  "헬다이버 출동!","결연한 베테랑","최첨단","민주적 폭파","극지의 애국자",
  "독사 특공대","자유의 불꽃","화학 요원","진리의 집행자","도시 전설",
  "자유의 종복","정의의 경계선","의장의 달인","법의 위력","대조군",
  "먼지 폭풍","금사 특공대","존재하지 않는 부대","공성 파괴자",
  "민주적 궤도 강하 타격대","정의로운 망령","견고한 참호 사단","외계 전문가",
];
function sortWbList(list) {
  return [...list].sort((a, b) => {
    const ai = WB_ORDER.indexOf(a), bi = WB_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

/* ── 전쟁 채권 배지 스타일 (App.jsx와 동일) ── */
const WB_STYLES = {
  "헬다이버 출동!":         { color:"#f7f352", background:"#0e2c2e" },
  "결연한 베테랑":          { color:"#ffffff", background:"#ea630f" },
  "최첨단":                { color:"#60d8ff", background:"#0044ab", borderColor:"rgba(96,216,255,.50)", textShadow:"0 0 10px #40efff" },
  "민주적 폭파":            { color:"#ef8f00", background:"#920f00" },
  "극지의 애국자":          { color:"#ffffff", background:"#3eb0e8" },
  "독사 특공대":            { color:"#ffffff", background:"#103318" },
  "자유의 불꽃":            { color:"#ff7918", background:"#562f18" },
  "화학 요원":              { color:"#d3ec18", background:"#3c4209" },
  "진리의 집행자":          { color:"#b50000", background:"#ceb7b7" },
  "도시 전설":              { color:"#ceae00", background:"#3c4548" },
  "자유의 종복":            { color:"#ffffff", background:"#180000" },
  "정의의 경계선":          { color:"#dddadd", background:"#422d21" },
  "의장의 달인":            { color:"#105994", background:"#ffffff", borderColor:"#efdf94" },
  "법의 위력":              { color:"#ffffff", background:"#1e1831", borderColor:"#d64566" },
  "대조군":                { color:"#15354e", background:"#d4d2d1" },
  "먼지 폭풍":              { color:"#efd7a8", background:"#301807" },
  "금사 특공대":            { color:"#bae0b2", background:"#1b1b0b" },
  "존재하지 않는 부대":     { color:"#fb8080", background:"#08191c", textShadow:"0 0 8px #410913" },
  "공성 파괴자":            { color:"#f1d460", background:"#2a292a", textShadow:"0 0 8px #a44c21" },
  "민주적 궤도 강하 타격대":{ color:"#ffffff", background:"#081c28", borderColor:"#fbfbaa" },
  "정의로운 망령":          { color:"#ffffff", background:"#1e1d1b", borderColor:"#fbee6b" },
  "슈퍼시민권 업그레이드":  { color:"#fee800", background:"#000000", borderColor:"#fee800" },
  "견고한 참호 사단":       { color:"#c7b243", background:"#040200", borderColor:"#978642" },
  "외계 전문가":            { color:"#654632", background:"#fffbe5", borderColor:"#c4a882" },
};
function getWbFilterStyle(wb, active) {
  const st = WB_STYLES[wb];
  if (!st) {
    return active
      ? { color:"#fff", background:"rgba(240,196,0,.18)", borderColor:"rgba(240,196,0,.6)", opacity:1 }
      : { color:"rgba(255,255,255,.35)", background:"rgba(255,255,255,.04)", borderColor:"rgba(255,255,255,.10)", opacity:0.55 };
  }
  if (active) {
    return {
      color:      st.color,
      background: st.background,
      borderColor:st.borderColor ?? "transparent",
      textShadow: st.textShadow  ?? "none",
      opacity: 1,
    };
  }
  // 비활성: 고유 색상 유지하되 opacity 낮춤
  return {
    color:      st.color,
    background: st.background,
    borderColor:st.borderColor ?? "transparent",
    textShadow: "none",
    opacity: 0.40,
  };
}

const s = (v) => String(v ?? "").trim();

/* ── GAS JSON 키 accessor ── */
const getWB         = (it) => s(it?.wbrequirement ?? "");
const getArmorValue = (it) => s(it?.armorValue    ?? "");
const getPassive    = (it) => s(it?.passive       ?? "");
const getSubType    = (it) => s(it?.subType ?? it?.subtype ?? "");
const getType       = (it) => s(it?.type    ?? "");
const getWeaponType = (it) => s(it?.weaponType ?? "");

const ARMOR_PEN_LABEL = {
  "2":"경장관","3":"일장관","4":"중장관",
  "5":"대전차1","6":"대전차2","7":"대전차3",
  "8":"대전차4","9":"대전차5","10":"대전차6",
};
const getArmorPen      = (it) => s(it?.armorPen ?? "");
const getArmorPenLabel = (it) => {
  const raw = getArmorPen(it);
  return ARMOR_PEN_LABEL[raw] || (raw ? raw : "");
};
const getArmorPenLabelMerged = (it) => {
  const raw = getArmorPen(it);
  if (!raw) return "";
  const n = Number(raw);
  if (!isNaN(n) && n >= 5) return "대전차";
  return ARMOR_PEN_LABEL[raw] || raw;
};
const getWeaponTraits = (it) => [s(it?.trait1??""),s(it?.trait2??""),s(it?.trait3??"")].filter(Boolean);

const WB_ALWAYS_INCLUDE = new Set(["기본","헬다이버 출동!"]);
const isSuperStore    = (it) => { const wb=getWB(it); return wb.includes("슈퍼")&&wb.includes("스토어"); };
/* 슈퍼 시민권 에디션 — 전쟁채권 칩에서 제거하고 별도 토글로 분리 */
const SUPER_CITIZEN_WB = "슈퍼시민권 업그레이드";
const isSuperCitizen   = (it) => getWB(it) === SUPER_CITIZEN_WB;

/* ── 스트라타젬 type 순서: 공격 > 지원 > 방어 ── */
const STRAT_TYPE_ORDER = ["공격","지원","방어"];
const TYPE_COLORS = { "공격":"#fe5f47","지원":"#bfe1f6","방어":"#d4edbc" };
const getTypeColor = (tp) => TYPE_COLORS[tp] ?? "rgba(255,255,255,0.85)";

const SUBTYPE_BACKPACK        = "배낭";
const SUBTYPE_BACKPACK_WEAPON = "지원배낭 무기";

/* ── 엑소슈트 판별 (4번 요청) ── */
const isExoSuit = (it) => String(it?.id ?? "").includes("st_vh_exo");

/* ── 스트라타젬 대분류: stratType 컬럼 (공격/지원/방어) ── */
const getStratType  = (it) => s(it?.stratType ?? "");

/* ── weaponType 정렬 순서 (10번 요청) — 실제 데이터값 사용 ── */
const WEAPON_TYPE_ORDER = ["돌격소총","지정사수소총","기관단총","산탄총","에너지","폭발","특수"];
function sortWeaponTypeOrder(keys) {
  return [...keys].sort((a, b) => {
    const ai = WEAPON_TYPE_ORDER.indexOf(a);
    const bi = WEAPON_TYPE_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

/* ── 장갑관통 필터 정렬 ── */
const PEN_FILTER_ORDER = ["경장관","일장관","중장관","대전차","대전차1","대전차2","대전차3","대전차4","대전차5","대전차6","비살상"];
function sortPenLabels(labels) {
  return [...labels].sort((a, b) => {
    const ai = PEN_FILTER_ORDER.indexOf(a), bi = PEN_FILTER_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

function uniqInOrder(arr) {
  const seen = new Set(), out = [];
  for (const v of arr) { const vv=s(v); if(!vv||seen.has(vv)) continue; seen.add(vv); out.push(vv); }
  return out;
}

/* ── 태그 툴팁 (SelectedPanel과 동일) — 검색 텍스트 소스로 사용 ── */
const PICKER_TAG_TOOLTIP = {
  "소이":"대상에게 유효한 사격을 가하면 불을 붙여 지속 피해를 줍니다.",
  "폭발성":"구조물 파괴가 가능합니다.",
  "레이저":"사격에 의해 발생한 열을 관리하면 무한히 발사가 가능합니다.",
  "플라즈마":"구조물 파괴가 불가능한 폭발 피해를 줍니다.",
  "아크":"제한된 사거리를 가진 아크를 무한히 발사할 수 있습니다.",
  "가스":"대부분의 소형 및 중형 적에게 피해를 주는 부식성 가스로, 대상을 혼란 상태로 만듭니다.",
  "기절":"기절 효과를 줘 적을 잠시 멈추게 만듭니다.",
  "치유":"피아식별 없이 대상을 치유합니다.",
  "한 손 파지":"한 손으로 물건을 운송하는 중에도 무기를 사용할 수 있습니다.",
  "단발 장전":"무기를 한 발씩 장전합니다.",
  "탄종/발사형식 변경":"무기에 발사형식이나 탄종을 변경하는 기능이 있습니다.",
  "차지 업":"충전해서 발사할 수 있습니다.",
  "과열":"사격시 무기가 과열되면 장갑 관통력이 상승합니다.",
  "총검":"총검이 장착되어있어 근접 공격의 장갑 관통력과 피해량이 상승합니다.",
  "소음기":"적이 가까운 거리에서도 격발 소음을 탐지할 수 없게 됩니다.",
  "방어막":"일시적인 방어막을 전개해 폭발과 고속 투사체를 방어합니다. 저속 물체는 막을 수 없습니다.",
  "유도":"대상을 자동으로 추적합니다.",
};

/* 아이템 한 개에서 검색 가능한 텍스트 모두 추출 */
function getItemSearchText(it) {
  const parts = [
    s(it?.name_ko), s(it?.desc),
    s(it?.trait1), s(it?.trait2), s(it?.trait3),
    s(it?.specialtrait),
    s(it?.armorValue), s(it?.passive),
  ];
  // 태그 툴팁도 포함
  const traits = [s(it?.trait1), s(it?.trait2), s(it?.trait3), s(it?.specialtrait)].filter(Boolean);
  for (const t of traits) {
    const tip = PICKER_TAG_TOOLTIP[t];
    if (tip) parts.push(tip);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function lsGet(key) { try { const r=localStorage.getItem(key); return r?JSON.parse(r):null; } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(key,JSON.stringify(val)); } catch {} }

/* ── sheet 기반 단일 확장자 결정 ──
 * stratagem → .svg 단일 (단, PNG 미준비 항목은 .png 임시 사용) / 그 외 → .png 단일
 */
const PNG_TEMP_STRATAGEM_IDS = new Set(["st_sw_mgx42","st_vh_exo51","st_vh_exo55"]);
function resolveExt(sheet, id) {
  if (String(sheet || "").toLowerCase() !== "stratagem") return ".png";
  if (id && PNG_TEMP_STRATAGEM_IDS.has(String(id))) return ".png";
  return ".svg";
}
function forceExt(url, ext) {
  return url.replace(/\.(png|svg|webp)$/i, ext);
}

function ItemIcon({ item, style={} }) {
  const sheet  = s(item?.sheet || item?.sheetName || item?.type);
  const itemId = s(item?.id);
  const ext    = resolveExt(sheet, itemId);
  const resolve = (it) => {
    const raw = s(it?.icon);
    const base = raw
      ? (/^https?:\/\//i.test(raw) ? raw : raw.startsWith("/") ? raw : `/${raw}`)
      : (() => { const id=s(it?.id); if(!id) return "/icons/_default.png"; const folder=sheet||"misc"; return `/icons/${folder}/${id}.png`; })();
    return forceExt(base, ext);
  };
  const primary = resolve(item);
  const [dead, setDead] = useState(false);
  useEffect(() => { setDead(false); }, [primary]);
  if (dead) return (
    <span style={{ opacity:0.45, fontSize:11, color:"rgba(255,255,255,.5)", textAlign:"center", lineHeight:1.3, whiteSpace:"nowrap" }}>이미지<br/>준비중</span>
  );
  return (
    <img style={{ display:"block", background:"transparent", ...style }} src={primary}
      alt={s(item?.name_ko)||s(item?.id)} draggable={false}
      onError={() => { setDead(true); }}
    />
  );
}

function makeInitFilters(wbOptions, storageKey) {
  const saved = lsGet(storageKey);
  if (saved && Array.isArray(saved.ownedWb)) {
    const valid = saved.ownedWb.filter(w => wbOptions.includes(w));
    return {
      ownedWb:              new Set(valid),
      armorValue:           new Set(Array.isArray(saved.armorValue) ? saved.armorValue : []),
      passive:              new Set(Array.isArray(saved.passive)    ? saved.passive    : []),
      armorPen:             new Set(Array.isArray(saved.armorPen)   ? saved.armorPen   : []),
      traits:               new Set(Array.isArray(saved.traits)     ? saved.traits     : []),
      weaponType:           new Set(Array.isArray(saved.weaponType) ? saved.weaponType : []),
      stratSubType:         new Set(Array.isArray(saved.stratSubType) ? saved.stratSubType : []),
      includeSuperStore:    saved.includeSuperStore === false ? false : true,
      includeSuperCitizen:  !!saved.includeSuperCitizen,
    };
  }
  return { ownedWb:new Set(wbOptions), armorValue:new Set(), passive:new Set(), armorPen:new Set(), traits:new Set(), weaponType:new Set(), stratSubType:new Set(), includeSuperStore:true, includeSuperCitizen:false };
}

export default function PickerModal({
  open, typeKey="", slotKind="", isWeapon=false,
  title, items, pickedId,
  onPick, onClose,
  selectedStratagemIds, activeStratagemPickedId,
  stratagemSlots, activeSlotIndex, onPreviewSlotClick,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const isStratagemMode = slotKind === "stratagem";
  const isArmorMode     = slotKind === "armor";
  const isMergedPen     = slotKind === "secondary" || slotKind === "throwable";
  const storageKey      = `pickerFilters_v7:${slotKind||"unknown"}`;
  const isMobile        = typeof window !== "undefined" && window.innerWidth <= 700;

  const wbOptions = useMemo(() => {
    const all = uniqInOrder(items.map(getWB));
    const filtered = all.filter(wb => wb && !WB_ALWAYS_INCLUDE.has(wb) && !isSuperStore({wbrequirement:wb}) && wb !== SUPER_CITIZEN_WB);
    return sortWbList(filtered);
  }, [items]);

  const [filters, setFilters] = useState(() => ({
    ownedWb:new Set(), armorValue:new Set(), passive:new Set(),
    armorPen:new Set(), traits:new Set(), weaponType:new Set(),
    stratSubType:new Set(),
    includeSuperStore:true, includeSuperCitizen:false,
  }));
  const initializedForKey = useRef("");

  useEffect(() => {
    if (!open) return;
    if (wbOptions.length===0) return;
    if (initializedForKey.current===storageKey) return;
    initializedForKey.current = storageKey;
    setFilters(makeInitFilters(wbOptions, storageKey));
  }, [open, wbOptions, storageKey]);

  useEffect(() => {
    if (!open) { initializedForKey.current=""; setFilterOpen(false); setSearchText(""); }
  }, [open]);

  useEffect(() => {
    if (!open || initializedForKey.current!==storageKey) return;
    lsSet(storageKey, {
      ownedWb:Array.from(filters.ownedWb), armorValue:Array.from(filters.armorValue),
      passive:Array.from(filters.passive),  armorPen:Array.from(filters.armorPen),
      traits:Array.from(filters.traits),    weaponType:Array.from(filters.weaponType),
      stratSubType:Array.from(filters.stratSubType),
      includeSuperStore:filters.includeSuperStore, includeSuperCitizen:filters.includeSuperCitizen,
    });
  }, [filters, open, storageKey]);

  const togOwn          = (wb)  => setFilters(p => { const o=new Set(p.ownedWb); o.has(wb)?o.delete(wb):o.add(wb); return {...p,ownedWb:o}; });
  const selAll          = ()    => setFilters(p => ({...p, ownedWb:new Set(wbOptions)}));
  const deselAll        = ()    => setFilters(p => ({...p, ownedWb:new Set()}));
  const resetAll        = ()    => setFilters({ownedWb:new Set(wbOptions),armorValue:new Set(),passive:new Set(),armorPen:new Set(),traits:new Set(),weaponType:new Set(),stratSubType:new Set(),includeSuperStore:true,includeSuperCitizen:false});
  const togSet          = (k,v) => setFilters(p => { const s2=new Set(p[k]); const next=new Set(); if(!s2.has(v)) next.add(v); return {...p,[k]:next}; });
  const togSuper        = ()    => setFilters(p => ({...p, includeSuperStore:!p.includeSuperStore}));
  const togSuperCitizen = ()    => setFilters(p => ({...p, includeSuperCitizen:!p.includeSuperCitizen}));

  /* ── 엑소슈트 선택 현황 (4번 요청) ── */
  const hasExoSelected = useMemo(() => {
    if (!isStratagemMode) return false;
    return (stratagemSlots??[]).some(it => it && isExoSuit(it));
  }, [stratagemSlots, isStratagemMode]);

  const exoSelectedId = useMemo(() => {
    if (!isStratagemMode) return null;
    const found = (stratagemSlots??[]).find(it => it && isExoSuit(it));
    return found ? String(found.id) : null;
  }, [stratagemSlots, isStratagemMode]);

  const itemsByOwnership = useMemo(() => items.filter(it => {
    const wb = getWB(it);
    if (isSuperStore(it))          return true;   // 항상 표시
    if (isSuperCitizen(it))        return true;   // 항상 표시
    if (WB_ALWAYS_INCLUDE.has(wb)) return true;
    if (!wb)                       return true;
    return filters.ownedWb.has(wb);
  }), [items, filters.ownedWb, isStratagemMode]);

  const filterOptions = useMemo(() => {
    if (isStratagemMode) return {};
    if (isArmorMode) {
      return {
        armorValue: uniqInOrder(itemsByOwnership.map(getArmorValue)).sort((a,b) => {
          const ord=["경량","일반","중량"]; const ai=ord.indexOf(a),bi=ord.indexOf(b);
          if(ai!==-1&&bi!==-1) return ai-bi; return a.localeCompare(b,"ko");
        }),
        passive: uniqInOrder(itemsByOwnership.map(getPassive)).sort((a,b)=>a.localeCompare(b,"ko")),
      };
    }
    /* 무기 슬롯: weaponType 소분류 목록 — 전체 기준 (다른 소분류로 전환 가능하도록) */
    const weaponTypes = isWeapon
      ? sortWeaponTypeOrder(uniqInOrder(itemsByOwnership.map(getWeaponType).filter(Boolean)))
      : [];

    const labelFn = isMergedPen ? getArmorPenLabelMerged : getArmorPenLabel;

    // 각 필터 옵션은 "나머지 필터가 적용된 아이템"을 기준으로 산출 (교차 필터링)
    // armorPen 옵션: weaponType + traits 가 걸린 아이템 기준
    const baseForPen = itemsByOwnership.filter(it => {
      if (filters.weaponType.size > 0 && !filters.weaponType.has(getWeaponType(it))) return false;
      if (filters.traits.size > 0) {
        const itTraits = getWeaponTraits(it);
        if (![...filters.traits].some(t => itTraits.includes(t))) return false;
      }
      return true;
    });
    const penLabels = sortPenLabels(uniqInOrder(baseForPen.map(labelFn).filter(Boolean)));

    // traits 옵션: weaponType + armorPen 이 걸린 아이템 기준
    const baseForTraits = itemsByOwnership.filter(it => {
      if (filters.weaponType.size > 0 && !filters.weaponType.has(getWeaponType(it))) return false;
      if (filters.armorPen.size > 0 && !filters.armorPen.has(labelFn(it))) return false;
      return true;
    });
    const allTraits = [];
    for (const it of baseForTraits) {
      for (const t of getWeaponTraits(it)) { if(!allTraits.includes(t)) allTraits.push(t); }
    }

    return { armorPen:penLabels, traits:allTraits.sort((a,b)=>a.localeCompare(b,"ko")), weaponTypes };
  }, [itemsByOwnership, filters.weaponType, filters.armorPen, filters.traits, isStratagemMode, isArmorMode, isMergedPen, slotKind, isWeapon]);

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return itemsByOwnership.filter(it => {
      // 텍스트 검색 중이면 상세 필터(armorValue/passive/weaponType/armorPen/traits/stratSubType) 무시
      if (!query) {
        if (isArmorMode) {
          if (filters.armorValue.size>0 && !filters.armorValue.has(getArmorValue(it))) return false;
          if (filters.passive.size>0    && !filters.passive.has(getPassive(it)))       return false;
        } else if (isWeapon) {
          if (filters.weaponType.size>0 && !filters.weaponType.has(getWeaponType(it))) return false;
          if (filters.armorPen.size>0) {
            const labelFn = isMergedPen ? getArmorPenLabelMerged : getArmorPenLabel;
            if (!filters.armorPen.has(labelFn(it))) return false;
          }
          if (filters.traits.size>0) {
            const itTraits = getWeaponTraits(it);
            if (![...filters.traits].some(t => itTraits.includes(t))) return false;
          }
        }
        if (isStratagemMode && filters.stratSubType.size > 0) {
          const itSub = getSubType(it);
          const filterSub = [...filters.stratSubType][0];
          const matchSub = filterSub === "배낭 지원무기" ? "지원배낭 무기" : filterSub;
          if (itSub !== matchSub) return false;
        }
      }
      // 텍스트 검색 (채권 소유 필터는 항상 적용)
      if (query) {
        if (!getItemSearchText(it).includes(query)) return false;
      }
      return true;
    });
  }, [itemsByOwnership, filters, isArmorMode, isWeapon, isMergedPen, slotKind, isStratagemMode, searchText]);

  /* 스트라타젬: 공격>지원>방어 순
     지원 그룹 내부:
       1순위 subType: 지원무기 > 지원배낭무기 > 일회용 지원무기 > 배낭 > 탑승물
       2순위 wbrequirement: 기본 > 화학요원 > 도시전설 > 자유의종복 > 정의의경계선 > 의장의달인 > 법의위력 > 대조군 > 먼지폭풍 > 금사특공대 > 존재하지않는부대 > 공성파괴자
       3순위 unlock 레벨 오름차순 */
  const SUPPORT_SUB_ORDER = ["지원무기","배낭 지원무기","일회용 지원무기","배낭","탑승물"];
  const BACKPACK_LINKED_IDS = ["sw_m1000","sw_c4","sw_gl28"]; // 배낭 연동 지원무기 ID 목록
  const SUPPORT_WB_ORDER  = [
    "기본","헬다이버 출동!",
    "화학 요원","도시 전설","자유의 종복","정의의 경계선",
    "의장의 달인","법의 위력","대조군","먼지 폭풍",
    "금사 특공대","존재하지 않는 부대","공성 파괴자",
  ];
  /* 지원 subType별 세분화 섹션 키 (지원__지원무기 형태로 map에 저장) */
  const SUPPORT_SUB_SECTION_KEYS = SUPPORT_SUB_ORDER.map(sub => `지원__${sub}`);
  const isSupportSubKey = (tp) => tp.startsWith("지원__");
  const getSupportSubLabel = (tp) => tp.replace(/^지원__/, "");

  const stratGrouped = useMemo(() => {
    if (!isStratagemMode) return null;
    const map = new Map();
    for (const it of filteredItems) {
      const tp = getStratType(it) || "기타";
      if (tp === "지원") {
        // 지원은 subType별 섹션으로 분리
        let sub = getSubType(it) || "지원무기";
        // "지원배낭 무기"(BACKPACK_LINKED 포함) → 표시명 "배낭 지원무기"로 통일
        if (sub === "지원배낭 무기") sub = "배낭 지원무기";
        const key = `지원__${sub}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(it);
      } else {
        if (!map.has(tp)) map.set(tp, []);
        map.get(tp).push(it);
      }
    }
    // 각 지원 서브섹션 내부 정렬: 채권 순 > unlock 순
    for (const key of map.keys()) {
      if (!isSupportSubKey(key)) continue;
      map.get(key).sort((a, b) => {
        const wa = s(a?.wbrequirement)||"기본", wb2 = s(b?.wbrequirement)||"기본";
        const wi = SUPPORT_WB_ORDER.indexOf(wa), wj = SUPPORT_WB_ORDER.indexOf(wb2);
        const wbDiff = (wi===-1?99:wi) - (wj===-1?99:wj);
        if (wbDiff !== 0) return wbDiff;
        return (Number(s(a?.unlock))||0) - (Number(s(b?.unlock))||0);
      });
    }
    // 비지원 그룹 내부 정렬 (기존 유지: 기본 순서)
    const nonSupportOrder = STRAT_TYPE_ORDER.filter(tp => tp !== "지원" && map.has(tp));
    const supportSubOrder = SUPPORT_SUB_SECTION_KEYS.filter(k => map.has(k));
    const etcOrder = [...map.keys()].filter(tp => !STRAT_TYPE_ORDER.includes(tp) && !isSupportSubKey(tp));
    // 공격 > 지원(서브 순서) > 방어 > 기타
    const attackOrder = map.has("공격") ? ["공격"] : [];
    const defenseOrder = map.has("방어") ? ["방어"] : [];
    const order = [...attackOrder, ...supportSubOrder, ...defenseOrder, ...etcOrder];
    return { order, map };
  }, [filteredItems, isStratagemMode]);

  /* 무기: weaponType 정렬 순서 적용 (10번 요청) */
  const grouped = useMemo(() => {
    if (isStratagemMode) return { order:[], map:new Map() };
    const map = new Map();
    for (const it of filteredItems) {
      const key = isWeapon
        ? (getWeaponType(it) || getWB(it) || "기타")
        : (getWB(it) || "기타");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    let order = [...map.keys()];
    if (isWeapon) order = sortWeaponTypeOrder(order);
    return { order, map };
  }, [filteredItems, isStratagemMode, isWeapon]);

  const isFilterActive =
    filters.ownedWb.size < wbOptions.length
    || (isArmorMode && (filters.armorValue.size>0 || filters.passive.size>0))
    || (isWeapon   && (filters.armorPen.size>0   || filters.traits.size>0 || filters.weaponType.size>0))
    || (isStratagemMode && filters.stratSubType.size>0);

  const hasBackpackWeaponSelected = useMemo(() => {
    if (!isStratagemMode) return false;
    return (stratagemSlots??[]).some(it => it && getSubType(it)===SUBTYPE_BACKPACK_WEAPON);
  }, [stratagemSlots, isStratagemMode]);

  const hasFullConflict = useMemo(() => {
    if (!isStratagemMode) return false;
    const subs = (stratagemSlots??[]).filter(Boolean).map(getSubType);
    return subs.includes(SUBTYPE_BACKPACK) && subs.includes(SUBTYPE_BACKPACK_WEAPON);
  }, [stratagemSlots, isStratagemMode]);

  if (!open) return null;
  const slots    = stratagemSlots ?? [null,null,null,null];
  const activeIdx = activeSlotIndex ?? 0;

  return (
    <div className="modalOverlay" onClick={onClose} role="presentation" aria-hidden={!open}>
      <div className="modalCard" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true">

        {/* 헤더 */}
        <div className="modalHeader">
          <div className="modalTitleRow">
            <div className="modalTitle">{title||"선택"}</div>
            <button className="modalFilterBtn" onClick={()=>setFilterOpen(v=>!v)} type="button">
              필터 {filterOpen?"닫기":"열기"}
              {isFilterActive && <span className="filterActiveBadge">●</span>}
            </button>
          </div>
          <button className="modalClose" onClick={onClose} type="button">닫기</button>
        </div>

        {/* 검색창 */}
        <div className="modalSearchBar">
          <input
            className="modalSearchInput"
            type="text"
            placeholder="이름, 설명, 특성으로 검색…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {searchText && (
            <button className="modalSearchClear" onClick={() => setSearchText("")} type="button">✕</button>
          )}
        </div>

        {/* 필터 패널 */}
        {filterOpen && (
          <div className="filterPanel">
            <div className="filterGroup">
              <div className="filterHead">
                <div className="filterTitle">전쟁 채권 (소지) — {filters.ownedWb.size}/{wbOptions.length}</div>
                <div style={{ display:"flex", gap:6 }}>
                  <button className="filterMiniBtn" onClick={selAll}   type="button">전체 선택</button>
                  <button className="filterMiniBtn" onClick={deselAll} type="button">전체 해제</button>
                </div>
              </div>
              <div className="filterChips">
                {!wbOptions.length && <div className="filterEmpty">옵션 없음</div>}
                {wbOptions.map(wb => {
                  const checked = filters.ownedWb.has(wb);
                  const st = getWbFilterStyle(wb, checked);
                  return (
                    <button key={wb} type="button"
                      className="filterWbChip"
                      style={{
                        color:      st.color,
                        background: st.background,
                        borderColor:st.borderColor,
                        textShadow: st.textShadow ?? "none",
                        opacity:    st.opacity,
                      }}
                      onClick={() => togOwn(wb)}
                    >{wb}</button>
                  );
                })}
              </div>
            </div>
            {isStratagemMode && (
              <>
                <FilterGroup
                  title="대분류"
                  options={["궤도","이글","지원무기","배낭 지원무기","일회용 지원무기","배낭","탑승물","센트리","거치포","배치형"]}
                  selected={filters.stratSubType}
                  onToggle={v => setFilters(p => ({ ...p, stratSubType: p.stratSubType.has(v) ? new Set() : new Set([v]) }))}
                  collapsible={isMobile}
                />
                <div className="filterFooter">
                  <button className="filterResetBtn" onClick={resetAll} type="button">필터 선택 초기화</button>
                </div>
              </>
            )}
            {isArmorMode && (
              <>
                <FilterGroup title="장갑 등급" options={filterOptions.armorValue??[]} selected={filters.armorValue} onToggle={v=>togSet("armorValue",v)} collapsible={isMobile} />
                <FilterGroup title="패시브"    options={filterOptions.passive??[]}    selected={filters.passive}    onToggle={v=>togSet("passive",v)}    collapsible={isMobile} />
                <div className="filterFooter">
                  <button className="filterResetBtn" onClick={resetAll} type="button">필터 선택 초기화</button>
                </div>
              </>
            )}
            {isWeapon && (
              <>
                {isWeapon && (filterOptions.weaponTypes??[]).length>0 && (
                  <FilterGroup title="무기 소분류" options={filterOptions.weaponTypes??[]} selected={filters.weaponType} onToggle={v=>togSet("weaponType",v)} collapsible={isMobile} />
                )}
                <FilterGroup title="장갑 관통" options={filterOptions.armorPen??[]} selected={filters.armorPen} onToggle={v=>togSet("armorPen",v)} collapsible={isMobile} />
                <FilterGroup title="특성"      options={filterOptions.traits??[]}   selected={filters.traits}   onToggle={v=>togSet("traits",v)}   collapsible={isMobile} />
                <div className="filterFooter">
                  <button className="filterResetBtn" onClick={resetAll} type="button">필터 선택 초기화</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 스트라타젬 미리보기 */}
        {isStratagemMode && (
          <div className="stratPreviewBar">
            <div className="stratPreviewSlots">
              {slots.map((item, i) => {
                const isActive = i===activeIdx;
                const isDone   = item!=null && !isActive;
                /* 2번: 배낭+지원배낭무기 충돌 시 해당 subType 슬롯에만 강조 */
                const itemSub  = item ? getSubType(item) : "";
                const isConflictSlot = hasFullConflict && item!=null
                  && (itemSub===SUBTYPE_BACKPACK || itemSub===SUBTYPE_BACKPACK_WEAPON);
                /* 3번: 충돌 메세지 */
                const conflictMsg = isConflictSlot ? "지원배낭 무기 사용에 제약이 발생합니다." : null;
                return (
                  <button key={i} type="button"
                    className={[
                      "stratPreviewSlot",
                      isActive          ? "stratPreviewSlotActive"   : "",
                      isDone            ? "stratPreviewSlotDone"     : "",
                      isConflictSlot    ? "stratPreviewSlotConflict" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={()=>onPreviewSlotClick?.(i)}
                    title={item ? s(item.name_ko) : `슬롯 ${i+1}`}
                  >
                    <div className="stratPreviewThumb">
                      {isConflictSlot && <div className="stratPreviewWarnDot" />}
                      {item
                        ? <ItemIcon item={item} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                        : <span className="stratPreviewEmpty">{isActive?"선택 중":`#${i+1}`}</span>
                      }
                    </div>
                    {item && (
                      <div className="stratPreviewInfo">
                        <div className="stratPreviewName">{s(item.name_ko)}</div>
                        {/* 3번: 충돌 메세지 우선, 없으면 desc */}
                        {conflictMsg
                          ? <div className="stratPreviewConflictMsg">{conflictMsg}</div>
                          : item.desc && <div className="stratPreviewDesc">{s(item.desc)}</div>
                        }
                      </div>
                    )}
                    {isActive && !item && <div className="stratPreviewLabel">선택 중</div>}
                    {isActive && <div className="stratPreviewActiveDot" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modalHint">목록에서 선택하세요 ({filteredItems.length}개)</div>

        {/* 스트라타젬 목록 */}
        {isStratagemMode && stratGrouped ? (
          <div className="pickGrid stratGrid">
            {!filteredItems.length && <div className="pickEmpty">조건에 맞는 항목이 없습니다.</div>}
            {stratGrouped.order.map(tp => {
              const list  = stratGrouped.map.get(tp) || [];
              const isSubSec = isSupportSubKey(tp);
              const label = isSubSec ? getSupportSubLabel(tp) : tp;
              const color = isSubSec ? getTypeColor("지원") : getTypeColor(tp);
              return (
                <div key={tp} className="stratTypeSection">
                  <div className="stratTypeTitle" style={{ color, borderColor:`${color}55`, background:`${color}12` }}>{label}</div>
                  <div className="stratagemGrid">
                    {list.map(it => {
                      const id            = String(it.id||"");
                      const isActive      = pickedId!=null && String(it.id)===String(pickedId);
                      const alreadyPicked = selectedStratagemIds?.has(id) ?? false;
                      const isCurrent     = activeStratagemPickedId!=null && String(activeStratagemPickedId)===id;

                      /* 1번 수정: 엑소슈트 중복 제한
                       * - 현재 활성 슬롯에 이미 엑소슈트가 선택된 경우(isCurrent 또는 activeSlot이 엑소슈트)
                       *   → 다른 엑소슈트도 선택 가능 (교체)
                       * - 다른 슬롯에 엑소슈트가 있고, 현재 슬롯은 엑소슈트가 아닌 경우
                       *   → 이 아이템이 엑소슈트면 disabled
                       */
                      const activeSlotIsExo = activeStratagemPickedId!=null
                        && isExoSuit({ id: activeStratagemPickedId });
                      const exoBlocked = isExoSuit(it)
                        && hasExoSelected
                        && !activeSlotIsExo   // 현재 슬롯이 이미 엑소슈트면 교체 허용
                        && exoSelectedId !== id;

                      const disabled = (alreadyPicked && !isCurrent) || exoBlocked;
                      const showWarn = !disabled && getSubType(it)===SUBTYPE_BACKPACK && hasBackpackWeaponSelected;

                      return (
                        <button key={id}
                          className={`stratagemBtn ${isActive?"active":""} ${disabled?"disabled":""}`}
                          type="button" disabled={disabled}
                          onClick={()=>{ if(!disabled) onPick(it); }}
                          title={s(it.name_ko)||id}
                        >
                          {showWarn && <div className="stratWarnDot" />}
                          <ItemIcon item={it} style={{ width:"100%", height:"100%", objectFit:"contain", display:"block" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 방어구/무기 목록 */
          <div className="pickGrid">
            {!filteredItems.length && <div className="pickEmpty">조건에 맞는 항목이 없습니다.</div>}
            {grouped.order.map(grpKey => {
              const list    = grouped.map.get(grpKey) || [];
              const isSuper = grpKey.includes("슈퍼") && grpKey.includes("스토어");
              return (
                <div key={grpKey} className="pickSection">
                  <div className={`pickSectionTitle ${isSuper?"super":""}`}>{grpKey}</div>
                  <div className="pickSectionGrid">
                    {list.map(it => {
                      const active = pickedId!=null && String(it.id)===String(pickedId);
                      return (
                        <button key={it.id}
                          className={`pickCard ${active?"active":""} ${isSuperStore(it)?"superItem":""} ${isSuperCitizen(it)?"superCitizenItem":""} ${String(it.id)==="pr_sm_mp98"?"glowItem":""}`}
                          onClick={()=>onPick(it)} type="button"
                        >
                          <div className="pickThumb">
                            <ItemIcon item={it} style={{ width:"100%", height:"100%", objectFit:"contain", objectPosition:"center" }} />
                          </div>
                          <div className="pickText">
                            <div className="pickName">{s(it.name_ko)||it.id}</div>
                            <div className="pickDesc">{it.desc||""}</div>
                            {isSuperCitizen(it) && (
                              <div className="pickUnlock" style={{color:"#fee800"}}>슈퍼 시민 에디션 업그레이드</div>
                            )}
                            {isSuperStore(it) && it.unlock!=null && it.unlock!=="" && (
                              <div className="pickUnlock">{String(it.unlock)}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, options, selected, onToggle, collapsible=true }) {
  const [open, setOpen] = useState(false);
  const activeCount = options.filter(o => selected.has(o)).length;
  return (
    <div className="filterGroup">
      <div className="filterHead"
        onClick={() => collapsible && setOpen(v => !v)}
        style={collapsible ? { cursor:"pointer", userSelect:"none" } : {}}>
        <div className="filterTitle" style={{ display:"flex", alignItems:"center", gap:6 }}>
          {title}
          {activeCount > 0 && (
            <span style={{
              width:7, height:7, borderRadius:"50%", flexShrink:0,
              background:"var(--yellow)",
              boxShadow:"0 0 5px rgba(240,196,0,.8), 0 0 10px rgba(240,196,0,.4)",
              display:"inline-block",
            }} />
          )}
        </div>
        {collapsible && (
          <span style={{ fontSize:11, color:"rgba(255,255,255,.40)", flexShrink:0 }}>
            {open ? "▲" : "▼"}
          </span>
        )}
      </div>
      {(!collapsible || open) && (
        <div className="filterChips">
          {!options.length && <div className="filterEmpty">옵션 없음</div>}
          {options.map(opt => {
            const checked = selected.has(opt);
            return (
              <button key={opt} type="button"
                className={`filterChip ${checked?"on":""}`}
                onClick={()=>onToggle(opt)}>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
