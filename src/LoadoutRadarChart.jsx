// LoadoutRadarChart.jsx
// 로드아웃 분석 레이더 차트 컴포넌트
// 레이어: 노란(개인장비) / 파란(+지원무장&배낭) / 빨간(+공격 스트라타젬) / 초록(+방어 스트라타젬)

import { useState } from "react";

const s = (v) => String(v ?? "").trim();
const getSubType  = (it) => s(it?.subType ?? it?.subtype ?? "");
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

/* ── 패시브 상수 ── */
// 강화/공병 키트 range+안정성 보너스 예외 무기 id
const REINFORCE_EXCEPTION_IDS = new Set([
  "pr_en_las5","pr_en_las13","se_sp_p33","se_ps_p92",
  "st_sw_eat17","st_sw_eat700","st_sw_eat411",
  "st_sw_las98","st_sw_las99","st_sw_gr8","st_sw_mg206",
  "st_sw_arc3","st_sw_rl77","st_sw_mls4x","st_sw_faf14",
  "st_sw_rs422","st_sw_stax3","st_sw_s11","st_sw_ms11","st_sw_m1000",
]);

const PASSIVE_GRENADE   = new Set(["공병 키트","통합 폭발물","충격 방지 패드, 척탄병"]);
const PASSIVE_OXYGEN    = "산소공급기";
const PASSIVE_SERVO     = "서보 보조";
const PASSIVE_IDEAL_BODY = "이상적인 체형";
const PASSIVE_VSRECOIL_SEC = "총잡이";

// 자신에게 소이/가스/아크 피해를 줄 수 없는 무기 예외 id
const SELF_FIRE_EXCEPTION_IDS = new Set([
  "pr_ar_ar2","pr_sg_sg225ie","pr_sg_sg451","pr_en_las5",
  "se_sp_p35","pr_en_arc12","se_sp_las7",
]);
// min.range GP-20 예외
const MINRANGE_EXCEPTION_IDS = new Set(["se_sp_gp20"]);

const EXCLUDE_VSHORDE_SUB = new Set(["지원배낭 무기","일회용 지원무기","탑승물","거치포"]);
const ATTACK_SUBTYPES     = new Set(["궤도","이글"]);
const DEFENSE_SUBTYPES    = new Set(["센트리","거치포","배치형"]);
// 배낭(Ergo=장비)과 탑승물(Ergo=탑승물)은 layer2(지원무기) 합산에 포함
const SUPPORT_SUBTYPES    = new Set(["지원무기","일회용 지원무기","지원배낭 무기","배낭","탑승물"]);

/* ── requirement 시트 데이터 (하드코딩) ── */
const REQUIREMENT_DATA = [
  { race:"테르미니드", faction:"일반",              vsHorde:10, vsTarget:5,  antiTank:5,  demolitionNum:11, stability:10, special:null },
  { race:"테르미니드", faction:"헌터/파운서",        vsHorde:12, vsTarget:3,  antiTank:4,  demolitionNum:11, stability:11, special:null },
  { race:"테르미니드", faction:"너싱/바일 스퓨어",   vsHorde:8,  vsTarget:7,  antiTank:4,  demolitionNum:11, stability:7,  special:null },
  { race:"테르미니드", faction:"하이브 가드",        vsHorde:9,  vsTarget:7,  antiTank:8,  demolitionNum:11, stability:7,  special:null },
  { race:"테르미니드", faction:"바일 변종",          vsHorde:12, vsTarget:6,  antiTank:6,  demolitionNum:11, stability:8,  special:null },
  { race:"테르미니드", faction:"프레데터 변종",      vsHorde:14, vsTarget:5,  antiTank:4,  demolitionNum:11, stability:12, special:null },
  { race:"테르미니드", faction:"스포어 버스트 변종", vsHorde:15, vsTarget:7,  antiTank:8,  demolitionNum:11, stability:12, special:null },
  { race:"테르미니드", faction:"하이브 월드",        vsHorde:13, vsTarget:10, antiTank:15, demolitionNum:13, stability:13, special:null },
  { race:"오토마톤",   faction:"일반",              vsHorde:8,  vsTarget:7,  antiTank:5,  demolitionNum:6,  stability:8,  special:"건쉽" },
  { race:"오토마톤",   faction:"트루퍼/스트라이더",  vsHorde:10, vsTarget:6,  antiTank:4,  demolitionNum:6,  stability:8,  special:null },
  { race:"오토마톤",   faction:"트루퍼/데버스테이터",vsHorde:9,  vsTarget:9,  antiTank:4,  demolitionNum:6,  stability:9,  special:null },
  { race:"오토마톤",   faction:"데버스테이터",       vsHorde:7,  vsTarget:10, antiTank:4,  demolitionNum:6,  stability:9,  special:null },
  { race:"오토마톤",   faction:"버서커/헐크",        vsHorde:10, vsTarget:7,  antiTank:6,  demolitionNum:6,  stability:10, special:null },
  { race:"오토마톤",   faction:"헐크 급증",          vsHorde:6,  vsTarget:10, antiTank:12, demolitionNum:6,  stability:12, special:null },
  { race:"오토마톤",   faction:"탱크",              vsHorde:6,  vsTarget:8,  antiTank:8,  demolitionNum:6,  stability:8,  special:null },
  { race:"오토마톤",   faction:"중장갑(워스트/팩스)", vsHorde:8,  vsTarget:9,  antiTank:10, demolitionNum:6,  stability:12, special:null },
  { race:"오토마톤",   faction:"소각대",             vsHorde:10, vsTarget:7,  antiTank:8,  demolitionNum:6,  stability:11, special:null },
  { race:"오토마톤",   faction:"제트 여단",          vsHorde:7,  vsTarget:8,  antiTank:6,  demolitionNum:6,  stability:10, special:null },
  { race:"오토마톤",   faction:"사이보그",           vsHorde:13, vsTarget:12, antiTank:15, demolitionNum:6,  stability:13, special:null },
  { race:"오토마톤",   faction:"팩토리 월드",        vsHorde:14, vsTarget:12, antiTank:15, demolitionNum:5,  stability:13, special:null },
  { race:"일루미닛",   faction:"무분별한 대중(무권자)",vsHorde:10, vsTarget:5,  antiTank:3,  demolitionNum:4,  stability:6,  special:"스팅레이" },
  { race:"일루미닛",   faction:"적임자(오버시어)",   vsHorde:13, vsTarget:12, antiTank:8,  demolitionNum:4,  stability:10, special:null },
];

// 종족 기본 이미지 (폴백용)
const RACE_BASE_IMG = {
  "테르미니드": "/icons/race/terminid.svg",
  "오토마톤":   "/icons/race/automaton.svg",
  "일루미닛":   "/icons/race/Illuminate.svg",
};
// 팩션(spawnTable)별 이미지 — 없으면 종족 기본 이미지 사용
const FACTION_IMG = {
  "프레데터 변종":    "/icons/race/ter_pred.svg",
  "스포어 버스트 변종": "/icons/race/ter_sprb.svg",
  "럽처 변종":       "/icons/race/ter_rup.svg",
  "소각대":          "/icons/race/auto_incorp.svg",
  "제트 여단":       "/icons/race/auto_jetb.svg",
  "사이보그":        "/icons/race/auto_cybrg.svg",
  "무분별한 대중":          "/icons/race/illu_mndless.svg",
  "무분별한 대중(무권자)":   "/icons/race/illu_mndless.svg",
  "적임자":                 "/icons/race/illu_appro.svg",
  "적임자(오버시어)":        "/icons/race/illu_appro.svg",
};
// 종족 아이콘 컴포넌트 (이미지, size px)
function RaceIcon({ race, faction, size = 16 }) {
  const src = (faction && FACTION_IMG[faction]) || RACE_BASE_IMG[race] || null;
  if (!src) return null;
  const fallback = RACE_BASE_IMG[race] || null;
  return (
    <img
      src={src}
      alt={faction || race}
      style={{ width:size, height:size, objectFit:"contain", flexShrink:0 }}
      onError={e => { if (fallback && e.target.src !== window.location.origin + fallback) e.target.src = fallback; }}
    />
  );
}
const RACE_COLORS = {
  "테르미니드": { bg:"rgba(255,193,0,.12)",  border:"rgba(255,193,0,.45)",  text:"#ffc100" },
  "오토마톤":   { bg:"rgba(235,52,58,.12)",  border:"rgba(235,52,58,.45)",  text:"#eb343a" },
  "일루미닛":   { bg:"rgba(164,25,248,.12)", border:"rgba(164,25,248,.45)", text:"#a419f8" },
};

// 태그 보유 여부 헬퍼 (모듈 레벨 — calcRadarLayers + LoadoutRadarChart 공용)
const hasTrait = (it, ...traits) => traits.some(t =>
  [s(it?.trait1).trim(), s(it?.trait2).trim(), s(it?.trait3).trim()].includes(t.trim())
);
const anyHasTrait = (items, ...traits) => items.some(it => hasTrait(it, ...traits));

/* ══════════════════════════════════════════════════════
   수치 계산 함수
   ══════════════════════════════════════════════════════ */
export function calcRadarLayers(selected, raceHint = "") {
  if (!selected) return {
    layers:[], rangeInfo:[], hasStrongDemo:false, maxStrongDemo:0,
    hasDemolition:false, totalDemoNum:0, allStratsSelected:false,
    mobilityTotal:0, mobilityBase:0, mobilityPassive:0, mobilityStrat:0, demoItems:[],
  };
  const armor     = selected.armor;
  const primary   = selected.primary;
  const secondary = selected.secondary;
  const throwable = selected.throwable;
  const strats    = (selected.stratagem || []).filter(Boolean);

  const passive    = s(armor?.passive    ?? "");
  const armorValue = s(armor?.armorValue ?? "");

  const supportWeapons = strats.filter(it => SUPPORT_SUBTYPES.has(getSubType(it)));
  const attackStrats   = strats.filter(it => ATTACK_SUBTYPES.has(getSubType(it)));
  const defenseStrats  = strats.filter(it => DEFENSE_SUBTYPES.has(getSubType(it)));

  /* GAS 전달 키: vsHorde, vsTarget, vsAntitank, demo, stability, stabilityBonus, minRange */
  function getItemStats(it) {
    if (!it) return { vsHorde:0, vsTarget:0, vsAntitank:0, demo:false, demoNum:0, stab:0, minRange:0 };
    return {
      vsHorde:    num(it.vsHorde    ?? 0),
      vsTarget:   num(it.vsTarget   ?? 0),
      vsAntitank: num(it.vsAntitank ?? 0),
      demo:       num(it.demo ?? 0) > 0,
      demoNum:    num(it.demoAmount ?? it.demoNum ?? 0),
      stab:       num(it.stability  ?? it.stablity ?? 0),
      minRange:   num(it.minRange   ?? 0),
    };
  }

  function isLowErgo(it) {
    if (!it) return false;
    const ergo = s(it.ergo ?? it.Ergo ?? "");
    return ergo === "낮음" || ergo === "보통";
  }

  /* ── 패시브 보정 ── */
  const allWeapons = [primary, secondary, throwable, ...strats].filter(Boolean);
  const personalWeapons = [primary, secondary, throwable].filter(Boolean);
  const primaryAndSecondary = [primary, secondary].filter(Boolean);

  let passiveStabilityBonus = 0;
  let passiveMinRangeBonus  = 0;
  let passiveSecStabBonus   = 0;
  let passiveVsTargetBonus  = 0;
  const hasIdealBody = passive === PASSIVE_IDEAL_BODY;

  switch (passive) {

    // 1. 정찰 / 발 먼저 / 신호 감소 — 소음기 or 탐지 범위 감소 태그 항목당 +1
    case "정찰": case "발 먼저": case "신호 감소":
      for (const it of allWeapons) {
        if (hasTrait(it, "소음기", "탐지 범위 감소")) passiveStabilityBonus += 1;
      }
      break;

    // 2. 강화 — 예외 무기 제외, 폭발성/플라즈마 태그 있으면 +2, range≥3 무기 +1
    case "강화":
      if (anyHasTrait(allWeapons, "폭발성", "플라즈마")) passiveStabilityBonus += 2;
      for (const it of primaryAndSecondary) {
        if (REINFORCE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (num(it?.range ?? 0) >= 3) passiveStabilityBonus += 1;
      }
      for (const it of supportWeapons) {
        if (REINFORCE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (num(it?.range ?? 0) >= 3) passiveStabilityBonus += 1;
      }
      break;

    // 3. 공병 키트 — weaponType 수류탄/특수 수류탄 항목 +2, 예외 제외 range≥3 +1
    case "공병 키트":
      for (const it of personalWeapons) {
        const wt = s(it?.weaponType ?? "");
        if (wt === "수류탄" || wt === "특수 수류탄") passiveStabilityBonus += 2;
      }
      for (const it of primaryAndSecondary) {
        if (REINFORCE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (num(it?.range ?? 0) >= 3) passiveStabilityBonus += 1;
      }
      for (const it of supportWeapons) {
        if (REINFORCE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (num(it?.range ?? 0) >= 3) passiveStabilityBonus += 1;
      }
      break;

    // 4. 민주주의의 가호 — B-100 선택 시 +1.5
    case "민주주의의 가호": {
      const b100 = strats.find(it => s(it?.id) === "st_bp_b100");
      if (b100) passiveStabilityBonus += 1.5;
      break;
    }

    // 5. 서보 보조 — 투척 ergo 항목 vsTarget +1
    case "서보 보조":
      if (throwable && s(throwable?.ergo ?? "").toLowerCase() === "투척")
        passiveVsTargetBonus += 1;
      break;

    // 6. 전도성 — G-31 아크 or A/ARC-3 테슬라 탑 선택 시 +2
    case "전도성":
      if (allWeapons.some(it => s(it?.id) === "th_sp_g31" || s(it?.id) === "st_ep_arc3"))
        passiveStabilityBonus += 2;
      break;

    // 7. 이상적인 체형 — 별도 처리 (isLowErgo)
    case "이상적인 체형":
      break;

    // 8. 인화성 물질 — 소이 or 과열 태그 항목 있으면 +1 (예외 무기 제외)
    case "인화성 물질":
      if (allWeapons.some(it => !SELF_FIRE_EXCEPTION_IDS.has(s(it?.id)) && hasTrait(it, "소이", "과열")))
        passiveStabilityBonus += 1;
      break;

    // 9. 고급 여과 — 가스 태그 항목 있으면 +1 (P-35 예외)
    case "고급 여과":
      if (allWeapons.some(it => !SELF_FIRE_EXCEPTION_IDS.has(s(it?.id)) && hasTrait(it, "가스")))
        passiveStabilityBonus += 1;
      break;

    // 10. 결연함 — Autofire=No이면서 range≥3인 항목 +1
    case "결연함":
      for (const it of [...primaryAndSecondary, ...supportWeapons]) {
        if (s(it?.autofire ?? "") === "No" && num(it?.range ?? 0) >= 3)
          passiveStabilityBonus += 1;
      }
      break;

    // 11. 포위 준비 완료 — Autofire=Yes이거나 range≥2인 항목 +1 (안정성), vsHorde 조건 없음
    case "포위 준비 완료":
      for (const it of [...primaryAndSecondary, ...supportWeapons]) {
        const af = s(it?.autofire ?? "");
        const rg = num(it?.range ?? 0);
        if (af === "Yes" || rg >= 2) passiveStabilityBonus += 1;
      }
      break;

    // 12. 통합 폭발물 — 안정성 -1 (수류탄 보너스는 PASSIVE_GRENADE에서 처리)
    case "통합 폭발물":
      passiveStabilityBonus -= 1;
      break;

    // 13. 총잡이 — 보조-권총/보조-특수 항목 min.Range +1, 안정성 +1
    case "총잡이":
      if (secondary) {
        const wt = s(secondary?.weaponType ?? "");
        if (wt === "보조-권총" || wt === "보조-특수") {
          passiveMinRangeBonus += 1;
          passiveStabilityBonus += 1;
        }
      }
      break;

    // 14. 강화된 견장 — Autofire=Yes 항목 안정성 +1, 총검/근접 태그 or 보조-근접 min.Range +1
    case "강화된 견장":
      for (const it of [...primaryAndSecondary, ...supportWeapons]) {
        if (s(it?.autofire ?? "") === "Yes") passiveStabilityBonus += 1;
        if (hasTrait(it, "총검", "근접") || s(it?.weaponType ?? "") === "보조-근접")
          passiveMinRangeBonus += 1;
      }
      break;

    // 15. 아드레노-제세동기 — G-31 아크 or A/ARC-3 테슬라 탑 선택 시 +1
    case "아드레노-제세동기":
      if (allWeapons.some(it => s(it?.id) === "th_sp_g31" || s(it?.id) === "st_ep_arc3"))
        passiveStabilityBonus += 1;
      break;

    // 16. 사막 돌격대 — 소이/가스/아크 태그 있으면 +1 (예외 무기 제외), 투척 vsTarget +1
    case "사막 돌격대":
      if (allWeapons.some(it => !SELF_FIRE_EXCEPTION_IDS.has(s(it?.id)) && hasTrait(it, "소이", "가스", "아크")))
        passiveStabilityBonus += 1;
      if (throwable && s(throwable?.ergo ?? "").toLowerCase() === "투척")
        passiveVsTargetBonus += 1;
      break;

    // 17. 굳건한 바위 — SH-20 선택 + 한손파지+폭발/플라즈마 무기 → 안정성+1, minRange+1
    //                  총검/근접 태그 or 보조-근접 → min.Range +1
    case "굳건한 바위": {
      const hasSH20 = strats.some(it => s(it?.id) === "st_bp_sh20");
      if (hasSH20) {
        for (const it of primaryAndSecondary) {
          if (s(it?.id) === "se_sp_gp20") continue;
          if (hasTrait(it, "한 손 파지") && hasTrait(it, "폭발성", "플라즈마")) {
            passiveStabilityBonus += 1;
            passiveMinRangeBonus  += 1;
            // SH-20 stabilityBonus도 +1 (레이어2에서 처리되므로 별도 표시)
          }
        }
      }
      for (const it of [...primaryAndSecondary, ...supportWeapons]) {
        if (MINRANGE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (hasTrait(it, "총검", "근접") || s(it?.weaponType ?? "") === "보조-근접")
          passiveMinRangeBonus += 1;
      }
      break;
    }

    // 18. 적응력 — 소이/가스/아크 태그 있으면 +1 (예외 무기 제외)
    case "적응력":
      if (allWeapons.some(it => !SELF_FIRE_EXCEPTION_IDS.has(s(it?.id)) && hasTrait(it, "소이", "가스", "아크")))
        passiveStabilityBonus += 1;
      break;

    // 19. 충격 방지 패드, 척탄병 — 폭발성/플라즈마 태그 +1, 수류탄/특수수류탄 +2
    case "충격 방지 패드, 척탄병":
      if (anyHasTrait(allWeapons, "폭발성", "플라즈마")) passiveStabilityBonus += 1;
      for (const it of personalWeapons) {
        const wt = s(it?.weaponType ?? "");
        if (wt === "수류탄" || wt === "특수 수류탄") passiveStabilityBonus += 2;
      }
      break;

    // 20. 충격 방지 패드, 위험물 — 폭발성/플라즈마/가스 태그 +1 (P-35 예외)
    //                             보조-권총/보조-특수 min.Range +1 (GP-20 예외)
    case "충격 방지 패드, 위험물":
      for (const it of allWeapons) {
        if (SELF_FIRE_EXCEPTION_IDS.has(s(it?.id))) continue;
        if (hasTrait(it, "폭발성", "플라즈마", "가스")) passiveStabilityBonus += 1;
      }
      if (secondary) {
        const wt = s(secondary?.weaponType ?? "");
        if ((wt === "보조-권총" || wt === "보조-특수") && !MINRANGE_EXCEPTION_IDS.has(s(secondary?.id ?? "")))
          passiveMinRangeBonus += 1;
      }
      break;

    // 21. 추가 완충제 (B-27 강화된 특공대) — +2
    case "추가 완충제":
      passiveStabilityBonus = s(armor?.id ?? "").includes("b27") ? 2 : 1;
      break;

    // 22. 충격 방지 패드, 강화 버전 (CPR-80) — +1 기본, 폭발성/플라즈마 태그 추가 +1
    case "충격 방지 패드, 강화 버전":
      passiveStabilityBonus += 1;
      if (anyHasTrait(allWeapons, "폭발성", "플라즈마")) passiveStabilityBonus += 1;
      break;

    // 구급 키트 / 탄도 완충제 / 보급 아드레날린 — 무조건 +1
    case "구급 키트": case "탄도 완충제": case "보급 아드레날린":
      passiveStabilityBonus += 1;
      break;

    default:
      break;
  }

  // vsAntitank 배율: 1→1, 2→×2, 3→×3 항목별 적용 후 합산
  function calcAntitankScore(items) {
    let total = 0;
    for (const it of items.filter(Boolean)) {
      const v = num(it?.vsAntitank ?? 0);
      if      (v >= 3) total += v * 3;
      else if (v >= 2) total += v * 2;
      else             total += v; // 1이하 고정
    }
    return total;
  }

  /* 레이어1: 개인장비 — 전체 합산 */
  let gearVsHorde = 0, gearVsTarget = 0;
  let gearDemoNum = 0, gearStab = 0, gearDemo = false, gearMinRange = 0;

  for (const it of [primary, secondary, throwable].filter(Boolean)) {
    const st = getItemStats(it);
    gearVsHorde  += st.vsHorde;
    gearVsTarget += st.vsTarget;
    gearStab     += st.stab;
    gearMinRange += st.minRange;
    if (st.demo) { gearDemo = true; gearDemoNum += st.demoNum; }
  }

  // vsAntitank — 새 배율 적용
  const layer1_raw_items = [primary, secondary, throwable].filter(Boolean);
  const layer1_raw_antitank_raw = layer1_raw_items.reduce((s, it) => s + num(it?.vsAntitank ?? 0), 0);
  const gearVsAntitank = Math.min(calcAntitankScore(layer1_raw_items), MAX_VAL);

  // 난전 수행 보너스 — weaponType별 세분화 + vsHorde÷2
  for (const it of [primary, secondary].filter(Boolean)) {
    const wt = s(it?.weaponType ?? "");
    const autofire = s(it?.autofire ?? "");
    if (wt === "돌격소총" || wt === "기관단총") {
      gearMinRange += 1;
    } else if (wt === "산탄총") {
      gearMinRange += 2;
      if (autofire === "Yes") gearMinRange += 0.5;
    }
    // vsHorde÷2 보너스 (주무기/보조무기)
    const vh = num(it?.vsHorde ?? 0);
    gearMinRange += Math.floor(vh / 2);
  }

  // 원거리 대응 보너스 — Autofire = No인 지정사수소총 / 지원무기: vsTarget + range÷2
  const RANGE_BONUS_TYPES = new Set(["지정사수소총"]);
  for (const it of [primary, secondary].filter(Boolean)) {
    const autofire = s(it?.autofire ?? "");
    const wt = s(it?.weaponType ?? "");
    if (autofire === "No" && RANGE_BONUS_TYPES.has(wt)) {
      const rangeVal = num(it?.range ?? 0);
      gearVsTarget += Math.floor(rangeVal / 2);
    }
  }

  // 이상적인 체형: Ergo 낮음→+2, 보통→+1 (주/보조/지원무기), 총검/근접 태그 or 보조-근접 → minRange+1
  if (hasIdealBody) {
    for (const it of [...primaryAndSecondary, ...supportWeapons]) {
      const ergo = s(it?.ergo ?? "");
      if (ergo === "낮음") gearStab += 2;
      else if (ergo === "보통") gearStab += 1;
      if (hasTrait(it, "총검", "근접") || s(it?.weaponType ?? "") === "보조-근접")
        gearMinRange += 1;
    }
  }

  // 수류탄 패시브 (공병키트/통합폭발물/충격방지패드 척탄병)
  const throwHasDemo = num(throwable?.demo ?? 0) > 0;
  if (throwHasDemo && PASSIVE_GRENADE.has(passive)) {
    gearDemoNum = (gearDemoNum || 0) + 2;
  }

  gearStab     += passiveStabilityBonus;
  gearMinRange += passiveMinRangeBonus;
  gearVsTarget += passiveVsTargetBonus;
  if (secondary) gearStab += passiveSecStabBonus;

  const layer1 = { vsHorde:gearVsHorde, vsTarget:gearVsTarget, vsAntitank:gearVsAntitank, demolition:gearDemoNum, stability:gearStab, minRange:gearMinRange };

  /* 레이어2: layer1 + 지원무장&배낭 누적합산
   * 지원무기는 임무 내내 사용하므로 개인장비에 더하는 방식으로 계산
   * 비일회성 우선, 없으면 일회성 사용 (최고값 1개만 반영)
   */
  let supVsHorde = 0, supVsTarget = 0, supVsAntitank = 0, supDemoNum = 0, supStab = 0, supMinRange = 0;
  const nonDisposable = supportWeapons.filter(it => getSubType(it) !== "일회용 지원무기");
  const supCandidates = nonDisposable.length > 0 ? nonDisposable : supportWeapons;
  for (const it of supCandidates) {
    const st = getItemStats(it);
    if (st.vsHorde    > supVsHorde)    supVsHorde    = st.vsHorde;
    if (st.vsTarget   > supVsTarget)   supVsTarget   = st.vsTarget;
    if (st.vsAntitank > supVsAntitank) supVsAntitank = st.vsAntitank;
    if (st.demoNum    > supDemoNum)    supDemoNum    = st.demoNum;
    if (st.stab       > supStab)       supStab       = st.stab;
    if (st.minRange   > supMinRange)   supMinRange   = st.minRange;
    // 원거리 보너스 — Autofire = No인 지원무기(지정사수소총 포함): range÷2
    const autofire = s(it?.autofire ?? "");
    const wt = s(it?.weaponType ?? "");
    if (autofire === "No" && (RANGE_BONUS_TYPES.has(wt) || getSubType(it) === "지원무기")) {
      const rangeVal = num(it?.range ?? 0);
      supVsTarget += Math.floor(rangeVal / 2);
    }
  }
  // Stability 보너스: 스트라타젬 분류에 맞게 각 레이어에 반영
  // (레이어2=지원무기/배낭/탑승물, 레이어3=공격, 레이어4=방어)
  let supStabBonus = 0, atkStabBonus = 0, defStabBonus = 0;
  for (const it of strats) {
    const bonus = num(it.stabilityBonus ?? 0);
    if (!bonus) continue;
    const sub = getSubType(it);
    if (SUPPORT_SUBTYPES.has(sub)) supStabBonus += bonus;
    else if (ATTACK_SUBTYPES.has(sub)) atkStabBonus += bonus;
    else if (DEFENSE_SUBTYPES.has(sub)) defStabBonus += bonus; // 센트리/거치포/배치형
    else supStabBonus += bonus; // 분류 불명확시 지원으로
  }
  supStab += supStabBonus;
  // 포위 준비 완료: 스트라타젬 포함 후 vsHorde +1
  if (passive === "포위 준비 완료" && supportWeapons.some(it => !EXCLUDE_VSHORDE_SUB.has(getSubType(it)))) {
    supVsHorde += 1;
  }

  // vsAntitank — 새 배율: 지원무기 원본값 추가 후 재계산
  const allLayer2Items = [...layer1_raw_items, ...supCandidates];
  const supVsAntitankScaled = Math.min(calcAntitankScore(allLayer2Items), MAX_VAL);

  const layer2 = {
    vsHorde:    layer1.vsHorde    + supVsHorde,
    vsTarget:   layer1.vsTarget   + supVsTarget,
    vsAntitank: supVsAntitankScaled,
    demolition: layer1.demolition + supDemoNum,
    stability:  layer1.stability  + supStab,
    minRange:   layer1.minRange   + supMinRange,
  };

  /* 레이어3: + 공격 스트라타젬 */
  let atkVsHorde = 0, atkVsTarget = 0, atkVsAntitank = 0, atkStab = 0, atkDemoNum = 0;
  const eagleMax = { vsHorde:0, vsTarget:0, vsAntitank:0, stab:0, demoNum:0 };
  for (const it of attackStrats.filter(it2 => getSubType(it2) === "이글")) {
    const st = getItemStats(it);
    if (st.vsHorde    > eagleMax.vsHorde)    eagleMax.vsHorde    = st.vsHorde;
    if (st.vsTarget   > eagleMax.vsTarget)   eagleMax.vsTarget   = st.vsTarget;
    if (st.vsAntitank > eagleMax.vsAntitank) eagleMax.vsAntitank = st.vsAntitank;
    if (st.stab       > eagleMax.stab)       eagleMax.stab       = st.stab;
    if (st.demoNum    > eagleMax.demoNum)    eagleMax.demoNum    = st.demoNum;
  }
  for (const it of attackStrats.filter(it2 => getSubType(it2) === "궤도")) {
    const st = getItemStats(it);
    atkVsHorde += st.vsHorde; atkVsTarget += st.vsTarget; atkVsAntitank += st.vsAntitank;
    atkStab += st.stab; atkDemoNum += st.demoNum;
  }
  const atkTotalItems = [...allLayer2Items,
    ...attackStrats.filter(it2 => getSubType(it2) === "궤도"),
    ...attackStrats.filter(it2 => getSubType(it2) === "이글").slice(0, 1), // 이글 최고 1개
  ];
  const layer3 = {
    vsHorde:    layer2.vsHorde    + atkVsHorde    + eagleMax.vsHorde,
    vsTarget:   layer2.vsTarget   + atkVsTarget   + eagleMax.vsTarget,
    vsAntitank: Math.min(calcAntitankScore(atkTotalItems), MAX_VAL),
    demolition: layer2.demolition + atkDemoNum    + eagleMax.demoNum,
    stability:  layer2.stability  + atkStab       + eagleMax.stab + atkStabBonus,
    minRange:   layer2.minRange,
  };

  /* 레이어4: + 방어 스트라타젬 */
  let defVsHorde = 0, defVsTarget = 0, defVsAntitank = 0, defStab = 0, defDemoNum = 0, defMinRange = 0;
  for (const it of defenseStrats) {
    const st = getItemStats(it);
    defVsHorde += st.vsHorde; defVsTarget += st.vsTarget; defVsAntitank += st.vsAntitank;
    defStab += st.stab; defDemoNum += st.demoNum;
    if (st.minRange > defMinRange) defMinRange = st.minRange;
  }
  const defTotalItems = [...allLayer2Items, ...defenseStrats];
  const layer4 = {
    vsHorde:    layer2.vsHorde    + defVsHorde,
    vsTarget:   layer2.vsTarget   + defVsTarget,
    vsAntitank: Math.min(calcAntitankScore(defTotalItems), MAX_VAL),
    demolition: layer2.demolition + defDemoNum,
    stability:  layer2.stability  + defStab + defStabBonus,
    minRange:   layer2.minRange   + defMinRange,
  };

  /* 교전 범위 (관통등급 + Ergo) */
  const PEN_LABEL = {
    "2":"경장갑 관통","3":"일반 장갑 관통","4":"중장갑 관통",
    "5":"대전차1","6":"대전차2","7":"대전차3",
    "8":"대전차4","9":"대전차5","10":"대전차6","비살상":"비살상",
  };
  // 복수 무장 탑승물/특수 무기: 기본 AP 태그 + 추가 태그 정의
  const PEN_EXTRA_TAGS = {
    "st_vh_exo45":  [{ raw:"6",  label:"대전차2(로켓)" }],
    "st_vh_exo51":  [{ raw:"6",  label:"대전차2(대전차포)" }],
    "st_vh_td220":  [{ raw:"8",  label:"대전차4(주포)" }],
    // LAS-17: 과열 단계에 따라 경장갑~중장갑 → 기본 태그 교체
    "pr_en_las17":  [{ raw:"4",  label:"경장갑 ~ 중장갑 관통(과열 단계에 따라)" }],
    // SG-20: 기절탄 추가
    "pr_sg_sg20":   [{ raw:"2",  label:"경장갑 관통(기절탄)" }],
    // AR/GL-21: 하부 유탄 추가
    "pr_ar_ar21":   [{ raw:"3",  label:"일반 장갑 관통(하부 유탄)" }],
    // SMG/FLAM-34: 화염방사기 추가
    "pr_sm_smg34":  [{ raw:"4",  label:"중장갑 관통(화염방사기)" }],
  };
  function penLabel(it) {
    if (!it) return null;
    const id  = s(it?.id ?? "");
    const raw = s(it?.armorPen ?? it?.["armorPen."] ?? "");
    if (!raw) return null;
    const base  = { raw, label: PEN_LABEL[raw] ?? raw };
    const extra = PEN_EXTRA_TAGS[id] ?? [];
    // LAS-17처럼 extra가 기본 태그를 완전히 교체해야 하는 경우:
    // extra 항목 중 raw가 기본 raw와 같으면 교체, 다르면 추가
    const REPLACE_BASE_IDS = new Set(["pr_en_las17"]);
    const pens = REPLACE_BASE_IDS.has(id) ? extra : [base, ...extra];
    return { raw, label: pens[0]?.label ?? base.label, pens };
  }
  function ergoInfo(it) {
    if (!it) return null;
    const ergo = s(it.ergo ?? it.Ergo ?? "");
    if (!ergo) return null;
    // 이상적인 체형: 낮음→보통, 보통→높음 (투척 제외: ergo가 "투척"이면 그대로)
    if (ergo === "투척") return { label:"투척", upgraded:false };
    if (hasIdealBody) {
      if (ergo === "낮음")  return { label:"보통", upgraded:true };
      if (ergo === "보통")  return { label:"높음", upgraded:true };
      return { label:ergo, upgraded:false };
    }
    return { label:ergo, upgraded:false };
  }

  // type=지원 + AP=비살상 + Ergo=장비 → 교전 범위 표시 제외
  const isRangeExcluded = (it) => {
    const ap   = s(it?.armorPen ?? it?.["armorPen."] ?? "");
    const ergo = s(it?.ergo ?? it?.Ergo ?? "");
    return ap === "비살상" && ergo === "장비";
  };

  const rangeInfo = [
    { slot:"주무기",   it:primary,   pen:penLabel(primary),   ergo:ergoInfo(primary)   },
    { slot:"보조무기", it:secondary, pen:penLabel(secondary), ergo:ergoInfo(secondary) },
    { slot:"투척무기", it:throwable, pen:penLabel(throwable), ergo:ergoInfo(throwable), isThrowable:true },
    ...supportWeapons
      .filter(it => !isRangeExcluded(it))
      .map(it => ({
        slot: "지원무기",
        name: s(it?.name_ko ?? it?.name ?? ""),
        it, pen:penLabel(it), ergo:ergoInfo(it),
      })),
  ].filter(r => r.pen || r.ergo);

  /* 구조물 파괴 수단 */
  const allItems = [primary, secondary, throwable, ...strats].filter(Boolean);
  let hasStrongDemo = false, maxStrongDemo = 0;
  let hasDemolition = false, totalDemoNum  = 0;
  for (const it of allItems) {
    const demoStr = num(it.demo ?? 0);
    if (demoStr >= 40) { hasStrongDemo = true; if (demoStr > maxStrongDemo) maxStrongDemo = demoStr; }
    if (demoStr > 0) {
      hasDemolition = true;
      const dn = num(it?.demoAmount ?? it?.demoNum ?? 0);
      const isThrow = s(it?.type ?? "").includes("투척");
      totalDemoNum += dn + (isThrow && PASSIVE_GRENADE.has(passive) ? 2 : 0);
    }
  }

  /* 스트라타젬 모두 선택됐는지 */
  const allStratsSelected = (selected.stratagem || []).filter(Boolean).length === 4;

  /* 기동력 */
  const mobilityBase    = armorValue === "경량" ? 1 : armorValue === "중량" ? -1 : 0;
  const mobilityPassive = passive === PASSIVE_OXYGEN ? 1 : 0;
  const mobilityStrat   = strats.some(it => s(it?.mobility ?? "").toLowerCase() === "yes") ? 1 : 0;
  const mobilityTotal   = mobilityBase + mobilityPassive + mobilityStrat;

  // 구조물 판정용 아이템 목록 (id, demo 강도, demoAmount, armorPen, name)

  /* ── B-01 보급팩 ── */
  const hasSupplyPack  = strats.some(it => s(it?.id ?? "") === "st_bp_b01");
  const SUPPLY_PACK_EXCL = new Set(["지원배낭 무기","일회용 지원무기"]);

  /* ── 포위 준비 완료 패시브 demoNum 보너스 ──
     CQC-20(st_sw_cqc20): 테르미니드에서는 demo 자체를 부여하지 않음 */
  const isSiege = passive === "포위 준비 완료";
  const isAut   = raceHint === "오토마톤";
  // 포위 준비 완료 패시브 개별 보너스 테이블
  const SIEGE_DEMO_BONUS = {
    "se_sp_gp31":  2,   // GP-31 유탄 권총
    "se_sp_p33":   1,   // P-33 미사일 권총
    "st_sw_plas45":3,   // PLAS-45 에포크
    "st_sw_s11":   3,   // S-11 작살총
    "st_sw_cqc20": 2,   // CQC-20 벽 폭파 망치 (오토마톤 한정)
  };
  // CQC-20: demo=20(DB값) — 오토마톤 선택 시에만 demoNum 적용, 그 외 demoNum=0
  const CQC20_ID = "st_sw_cqc20";

  const demoItems = allItems.map(it => {
    const id       = s(it?.id ?? "");
    const isCQC20  = id === CQC20_ID;

    // demoStr은 DB 값 그대로 사용 (CQC-20도 demo=20으로 DB에 입력됨)
    const demoStr = num(it.demo ?? 0);

    const isThrow    = s(it?.type ?? "").includes("투척");
    const rawDemoNum = num(it?.demoAmount ?? it?.demoNum ?? 0);

    // 수류탄 패시브 보너스 (투척 한정)
    const passiveBonus = (isThrow && PASSIVE_GRENADE.has(passive)) ? 2 : 0;

    // 포위 준비 완료 패시브 개별 보너스
    // CQC-20은 오토마톤 선택 시에만 적용
    const siegeBonus = (() => {
      if (!isSiege) return 0;
      if (isCQC20 && !isAut) return 0;
      return SIEGE_DEMO_BONUS[id] ?? 0;
    })();

    // B-01 보급팩 보너스
    const isBackpack = getSubType(it) === "배낭";
    const isSW_Excl  = SUPPLY_PACK_EXCL.has(getSubType(it));
    const supplyBonus = (hasSupplyPack && !isBackpack && !isSW_Excl && demoStr > 0) ? 1 : 0;

    // CQC-20 demoNum: 오토마톤 선택 시에만 적용, 그 외 0
    const effectiveDemoNum = isCQC20 && !isAut ? 0 : rawDemoNum;

    const demoNum  = effectiveDemoNum + passiveBonus + siegeBonus + supplyBonus;
    const rangeRaw = it?.range ?? it?.["min.Range"] ?? 0;
    const itemRange = rangeRaw === "퀘이사" ? 4 : num(rangeRaw);
    return {
      id,
      name:     s(it?.name_ko ?? it?.name ?? ""),
      demoStr,
      demoNum,
      armorPen: num(it?.armorPen ?? it?.["armorPen."] ?? 0),
      subType:  getSubType(it),
      range:    itemRange,
      isQuasar: id === "st_sw_las99",
    };
  }).filter(it => it.demoStr > 0);

  return {
    layers: [
      { key:"green",  label:"방어 스트라타젬 포함",  data:layer4, color:"rgba(74,222,128,",  stroke:"#4ade80" },
      { key:"red",    label:"공격 스트라타젬 포함",  data:layer3, color:"rgba(248,113,113,", stroke:"#f87171" },
      { key:"blue",   label:"지원무장 및 배낭 포함", data:layer2, color:"rgba(96,165,250,",  stroke:"#60a5fa" },
      { key:"yellow", label:"개인 장비",             data:layer1, color:"rgba(250,204,21,",  stroke:"#facc15" },
    ],
    rangeInfo,
    hasStrongDemo, maxStrongDemo,
    hasDemolition, totalDemoNum,
    allStratsSelected,
    mobilityTotal, mobilityBase, mobilityPassive, mobilityStrat,
    demoItems,
  };
}

/* ══════════════════════════════════════════════════════
   레이더 차트 SVG 컴포넌트
   ══════════════════════════════════════════════════════ */

const AXIS_TOOLTIP = {
  stability: {
    title: "안정성",
    lines: [
      "장비 구성의 전반적인 운영 안정성에 대한 평점입니다.",
      "· 보급 효율에 영향을 받음",
      "· 무기의 조작성에 영향을 받음",
      "· 방어구 또는 방어/지원 스트라타젬의 영향을 받음",
      "· 오폭, 오사 리스크에 영향을 크게 받음",
    ],
  },
  vsHorde: {
    title: "대물량",
    lines: [
      "다수의 소형 적 무리를 처리하는 능력에 대한 평점입니다.",
      "· 범위형 무기에 영향을 받음",
      "· BTK(탄 효율)이 좋은 무기에 영향을 받음",
      "· 공격 스트라타젬의 영향을 크게 받음",
    ],
  },
  vsAntitank: {
    title: "대전차",
    lines: [
      "중장갑, 혹은 그 이상의 장갑을 가진 적을 대응하는 능력에 대한 평점입니다.",
      "· 중장갑(AP4) 관통 및 대전차(AP5~) 무기에 영향을 받음",
      "· 대전차 목적을 띄는 스트라타젬에 영향을 크게 받음",
      "· 해당 수치가 부족하다고 게임이 안 굴러가는건 아님",
    ],
  },
  minRange: {
    title: "난전 수행",
    lines: [
      "근-중거리 안에서의 교전 능력에 대한 평점입니다.",
      "· 근접 전투에 유리하거나 적합한 무기군이 영향이 큼",
      "· 자동사격 여부에 영향을 받음",
    ],
  },
  vsTarget: {
    title: "원거리 대응",
    lines: [
      "중거리 이상에서의 교전 능력에 대한 평점입니다.",
      "· 단일 대상을 목표로 하는 무기가 영향이 큼",
      "· 원거리 교전에 무리가 없는 경우 영향이 큼",
    ],
  },
};

const AXES = [
  { key:"stability",  label:"안정성",      maxVal:15 },
  { key:"vsHorde",    label:"대물량",      maxVal:15 },
  { key:"vsAntitank", label:"대전차",      maxVal:15 },
  { key:"minRange",   label:"난전 수행",   maxVal:10 },
  { key:"vsTarget",   label:"원거리 대응", maxVal:15 },
];
const N = AXES.length;
const MAX_VAL = 15; // 기본 최대값 (폴백)

function polarToXY(cx, cy, r, idx) {
  const angle = (Math.PI * 2 * idx / N) - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}
function makePolygonPoints(cx, cy, maxR, data) {
  return AXES.map((ax, i) => {
    const axMax = ax.maxVal ?? MAX_VAL;
    const v = Math.min(num(data[ax.key] ?? 0), axMax);
    const p = polarToXY(cx, cy, (v / axMax) * maxR, i);
    return `${p.x},${p.y}`;
  }).join(" ");
}

/* Ergo 스타일 */
function getErgoStyle(label, upgraded) {
  if (upgraded) return { bg:"rgba(96,165,250,.18)", border:"rgba(96,165,250,.55)", color:"#60a5fa" };
  if (label === "높음")  return { bg:"rgba(134,239,172,.12)", border:"rgba(134,239,172,.40)", color:"#86efac" };
  if (label === "보통")  return { bg:"rgba(250,204,21,.10)",  border:"rgba(250,204,21,.38)",  color:"#fde047" };
  if (label === "낮음")  return { bg:"rgba(223,63,63,.12)",   border:"rgba(223,63,63,.40)",   color:"#df3f3f" };
  if (label === "투척")  return { bg:"rgba(255,255,255,.08)", border:"rgba(255,255,255,.30)", color:"#ffffff" };
  return null;
}

export default function LoadoutRadarChart({ selected, requirements = [], flyingEnemies = [], structures = [] }) {
  const [selectedRace,    setSelectedRace]    = useState(null);
  const [selectedFaction, setSelectedFaction] = useState(null);
  const [axisTooltip, setAxisTooltip] = useState(null); // { key, x, y }
  const [showAllTooltip, setShowAllTooltip] = useState(false); // 모바일 전체 툴팁

  const {
    layers, rangeInfo,
    hasStrongDemo, maxStrongDemo,
    hasDemolition, totalDemoNum,
    allStratsSelected,
    mobilityTotal, mobilityBase, mobilityPassive, mobilityStrat,
    demoItems,
  } = calcRadarLayers(selected, selectedRace ?? "");

  // 방어구 패시브 (컴포넌트 스코프)
  const armorPassive = s(selected.armor?.passive ?? "");

  // 교전 범위용 방어구 패시브 노트 계산 — armorpassive.txt 기준
  function rangePassiveNotes(it, slot) {
    if (!armorPassive || !it) return [];
    const pos  = (text) => ({ text, kind:"pos"  });
    const pos2 = (text) => ({ text, kind:"pos2" });
    const neg  = (text) => ({ text, kind:"neg"  });
    const notes = [];
    const id       = s(it?.id ?? "").toLowerCase();
    const traits   = [s(it?.trait1), s(it?.trait2), s(it?.trait3)];
    const ergoVal  = s(it?.ergo ?? it?.Ergo ?? "");
    const sub      = getSubType(it);
    const isBpW    = sub === "지원배낭 무기";
    const isDisp   = sub === "일회용 지원무기";
    const isPri    = slot === "주무기";
    const isSec    = slot === "보조무기";
    const isThrow  = slot === "투척무기";
    const isSup    = slot === "지원무기";
    const isWeapon = isPri || isSec || isSup; // 주/보조/지원 공통

    // ── 반동 감소 블랙리스트 / 화이트리스트 ──
    const RANGE_RECOIL_BL_SUBTYPES = new Set(["일회용 지원무기", "배낭", "탑승물"]);
    const RANGE_RECOIL_BL_IDS = new Set([
      "pr_en_arc12","se_sp_las7","pr_en_las5","pr_ex_r36","pr_ex_cb9",
      "se_sp_gp31","pr_sp_flam66","se_sp_p72","se_sp_p33",
      "st_sw_las98","st_sw_gr8","st_sw_flam40","st_sw_arc3","st_sw_rl77",
      "st_sw_las99","st_sw_faf14","st_sw_rs422","st_sw_stax3","st_sw_tx41",
      "st_sw_cqc1","st_sw_plas45","st_sw_s11","st_sw_cqc9","st_sw_c4",
      "st_sw_cqc20","st_sw_bflam80","st_ep_at12",
    ]);
    const RANGE_RECOIL_WL_IDS = new Set(["st_sw_mls4x","st_sw_mgx42"]);
    function canApplyRangeRecoil() {
      if (RANGE_RECOIL_WL_IDS.has(id)) return true;
      if (RANGE_RECOIL_BL_IDS.has(id)) return false;
      if (RANGE_RECOIL_BL_SUBTYPES.has(sub)) return false;
      return true;
    }

    /* ── 강화 ──────────────────────────────────── */
    if (armorPassive === "강화") {
      if ((traits.includes("폭발성") || traits.includes("플라즈마")) && !id.includes("sp_g123"))
        notes.push(pos2("폭발 피해 감소"));
      if (isWeapon && canApplyRangeRecoil()) notes.push(pos("반동 감소"));
    }
    /* ── 공병 키트 ─────────────────────────────── */
    if (armorPassive === "공병 키트") {
      if (isWeapon && canApplyRangeRecoil())  notes.push(pos("반동 감소"));
      if (isThrow)   notes.push(pos("최대 소지수"), pos("초기 보유량"));
    }
    /* ── 서보 보조 ─────────────────────────────── */
    if (armorPassive === "서보 보조") {
      if (ergoVal === "투척" && !id.includes("sp_g50")) notes.push(pos("투척 거리 증가"));
    }
    /* ── 전도성 ────────────────────────────────── */
    if (armorPassive === "전도성") {
      if (traits.includes("아크") && !id.includes("en_arc12") && !id.includes("sw_arc3"))
        notes.push(pos2("아크 피해 감소"));
    }
    /* ── 이상적인 체형 ─────────────────────────── */
    if (armorPassive === "이상적인 체형") {
      if (isWeapon && (ergoVal === "낮음" || ergoVal === "보통"))
        notes.push(pos("핸들링 개선"));
      if (traits.includes("총검") || traits.includes("근접") || id.includes("cqc"))
        notes.push(pos2("근접공격 피해량 증가"));
    }
    /* ── 인화성 물질 ───────────────────────────── */
    if (armorPassive === "인화성 물질") {
      const BL = ["pr_sg_sg225ie","pr_sg_sg451","pr_ar_ar2","pr_en_las5","se_sp_las7"];
      if (!BL.some(r => id.includes(r.split("_").pop()))) {
        if (traits.includes("소이") || traits.includes("과열"))
          notes.push(pos2("화염 피해 감소"));
      }
    }
    /* ── 고급 여과 ─────────────────────────────── */
    if (armorPassive === "고급 여과") {
      if (traits.includes("가스") && !id.includes("sp_p35"))
        notes.push(pos2("가스 피해 감소"));
    }
    /* ── 포위 준비 완료 ────────────────────────── */
    if (armorPassive === "포위 준비 완료") {
      const exclReload  = id.includes("en_arc12");
      const exclAmmo    = ["sp_gp20","en_arc12","sw_arc3","sw_cqc1","sw_cqc9"].some(r => id.includes(r))
        || isBpW || isDisp;
      if (isPri && !exclReload)    notes.push(pos("재장전 속도"));
      if (isWeapon && !exclAmmo)   notes.push(pos("최대 탄약수"));
    }
    /* ── 통합 폭발물 ───────────────────────────── */
    if (armorPassive === "통합 폭발물") {
      if (isThrow) notes.push(pos("최대 소지수"), pos("초기 보유량"));
    }
    /* ── 총잡이 ────────────────────────────────── */
    if (armorPassive === "총잡이" && isSec) {
      notes.push(pos("재장전 속도"), pos2("반동 감소"), pos("전환 속도"));
    }
    /* ── 강화된 견장 ───────────────────────────── */
    if (armorPassive === "강화된 견장") {
      if (isPri && !id.includes("en_arc12")) notes.push(pos("재장전 속도"));
      if (traits.includes("총검") || traits.includes("근접") || id.includes("cqc"))
        notes.push(pos("근접공격 피해량 증가"));
    }
    /* ── 아드레노-제세동기 ─────────────────────── */
    if (armorPassive === "아드레노-제세동기") {
      if (traits.includes("아크") && !id.includes("en_arc12") && !id.includes("sw_arc3"))
        notes.push(pos("아크 피해 감소"));
    }
    /* ── 사막 돌격대 ───────────────────────────── */
    if (armorPassive === "사막 돌격대") {
      const BL = ["pr_sg_sg225ie","pr_sg_sg451","pr_ar_ar2","pr_en_las5","se_sp_las7","se_sp_p35","pr_en_arc12","st_sw_arc3"];
      if (!BL.some(r => id.includes(r.split("_").pop()))) {
        if (traits.includes("소이") || traits.includes("아크") || traits.includes("가스"))
          notes.push(pos("상태이상 피해 감소"));
      }
      if (ergoVal === "투척" && !id.includes("sp_g50")) notes.push(pos("투척 거리 증가"));
    }
    /* ── 굳건한 바위 ───────────────────────────── */
    if (armorPassive === "굳건한 바위") {
      const BL = ["sp_gp20","sp_g50","sp_ted63","th_gr_g7","sp_g48","sp_p33","sw_eat411"];
      const hasExplosive = traits.includes("폭발성") && !BL.some(r => id.includes(r));
      // sh20 + cb9 조합: ++ 표시 (이 경우 + 레그돌 억제는 표시하지 않음)
      const allIds = [selected.primary, selected.secondary, selected.throwable,
        ...(Array.isArray(selected.stratagem) ? selected.stratagem : [])].filter(Boolean).map(i => s(i?.id??""));
      const hasShieldCombo = id.includes("cb9") && allIds.some(i => i.includes("sh20"));
      if (hasShieldCombo) {
        notes.push(pos2("레그돌 억제(방패 연계)"));
      } else if (hasExplosive) {
        notes.push(pos("레그돌 억제"));
      }
    }
    /* ── 적응력 ────────────────────────────────── */
    if (armorPassive === "적응력") {
      const BL = ["pr_sg_sg225ie","pr_sg_sg451","pr_ar_ar2","pr_en_las5","se_sp_las7","se_sp_p35","pr_en_arc12","st_sw_arc3"];
      if (!BL.some(r => id.includes(r.split("_").pop()))) {
        if (traits.includes("소이") || traits.includes("아크") || traits.includes("가스"))
          notes.push(pos("상태이상 피해 감소"));
      }
    }
    /* ── 충격 방지 패드, 척탄병 ────────────────── */
    if (armorPassive === "충격 방지 패드, 척탄병") {
      if ((traits.includes("폭발성") || traits.includes("플라즈마")) && !id.includes("sp_g123"))
        notes.push(pos2("폭발 피해 감소"));
      if (isThrow) notes.push(pos("최대 소지수"), pos("초기 보유량"));
    }
    /* ── 충격 방지 패드, 위험물 ─────────────────── */
    if (armorPassive === "충격 방지 패드, 위험물") {
      if ((traits.includes("폭발성") || traits.includes("플라즈마")) && !id.includes("sp_g123"))
        notes.push(pos2("폭발 피해 감소"));
      if (traits.includes("가스") && !id.includes("sp_p35"))
        notes.push(pos("가스 피해 감소"));
      if (isSec) notes.push(pos("반동 감소"));
    }
    /* ── 충격 방지 패드, 강화 버전 ──────────────── */
    if (armorPassive === "충격 방지 패드, 강화 버전") {
      if ((traits.includes("폭발성") || traits.includes("플라즈마")) && !id.includes("sp_g123"))
        notes.push(pos2("폭발 피해 감소"));
    }
    return notes;
  }

  // rangeInfo + 패시브 노트 결합 (컴포넌트 스코프)
  const rangeInfoWithPassive = rangeInfo
    .map(r => ({ ...r, passiveNotes: rangePassiveNotes(r.it, r.slot) }))
    .filter(r => r.pen || r.ergo || r.passiveNotes.length > 0);

  const CX = 160, CY = 155, MAX_R = 115;
  const RINGS = [0.25, 0.5, 0.75, 1.0];
  const FONT  = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";

  // 방어구 포함 뭐든 선택되면 그래프 표시
  const hasAny = selected && Object.values(selected).some(v => v != null);

  // requirements DB 데이터를 기존 REQUIREMENT_DATA 형태로 변환
  // "10(8)" 같은 혼합 표기에서 앞 숫자만 파싱
  function parseReqNum(v) {
    if (v === null || v === undefined || v === "") return 0;
    const str = String(v).trim();
    const match = str.match(/^(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  const reqDataNorm = requirements.map(r => ({
    race:          String(r.faction      ?? ""),
    faction:       String(r.spawnTable   ?? ""),
    vsHorde:       parseReqNum(r.vsHorde),
    vsTarget:      parseReqNum(r.vsTarget),
    antiTank:      parseReqNum(r.vsAntitank),
    demolitionNum: parseReqNum(r["demo.amount"]),
    stability:     parseReqNum(r.stability),
    minRange:      parseReqNum(r["min.Range"]),
    hardDemo:      parseReqNum(r.hardDemo),
    note:          String(r.note        ?? ""),
  }));

  const reqData = (selectedFaction && selectedRace)
    ? reqDataNorm.find(r => r.faction === selectedFaction && r.race === selectedRace)
    : null;

  // 비행형 적 대응 데이터 — race(종족) 기준으로 매핑
  // excludeSpawnTables: 해당 spawnTable에서는 비행형 적 미등장
  const flyingConfig = {
    "테르미니드": { name:"슈리커",  av:0, reqRange:2, excludeSpawnTables: new Set() },
    "오토마톤":   { name:"건쉽",    av:3, reqRange:3, excludeSpawnTables: new Set() },
    "일루미닛":   { name:"스팅레이", av:3, reqRange:3, excludeSpawnTables: new Set(["무분별한 대중","적임자"]) },
  };

  // 현재 로드아웃 전체 아이템 (무기+스트라타젬, 방어구 제외)
  const allLoadoutItems = [
    selected?.primary,
    selected?.secondary,
    selected?.throwable,
    ...(Array.isArray(selected?.stratagem) ? selected.stratagem : []),
  ].filter(Boolean);
  const maxArmorPen = Math.max(0, ...allLoadoutItems.map(it => num(it?.armorPen ?? 0)));
  const maxRange    = Math.max(0, ...allLoadoutItems.map(it => {
    const r = it?.range ?? "";
    return isNaN(Number(r)) ? 0 : Number(r);
  }));

  // ── 비행형 적 대응 판정 ──────────────────────────────────────

  // 전체 공통 대응 불가 목록 (블랙리스트)
  const FLYING_BLACKLIST_IDS = new Set([
    "st_st_m12","st_st_m23","st_st_gm17","st_st_las98",
  ]);
  const FLYING_BLACKLIST_WT  = new Set(["수류탄","특수 수류탄"]);
  const FLYING_BLACKLIST_SUB = new Set(["궤도","이글"]);

  function isBlacklisted(it) {
    return FLYING_BLACKLIST_IDS.has(s(it?.id ?? "")) ||
           FLYING_BLACKLIST_WT.has(s(it?.weaponType ?? "")) ||
           FLYING_BLACKLIST_SUB.has(s(it?.subType ?? it?.subtype ?? ""));
  }

  // 슈리커 — 전체 블랙리스트 + 슈리커 전용 블랙리스트 제외 후 남은 것으로 대응 가능
  // 슈리커 req.range = 2
  const SHRIEKER_BLACKLIST_IDS = new Set(["st_sw_rl77","st_sw_gl52"]);
  const SHRIEKER_WHITELIST_IDS = new Set(["st_sw_ac8"]);
  const hasShriekerCounter = allLoadoutItems.some(it => {
    const id = s(it?.id ?? "");
    if (SHRIEKER_WHITELIST_IDS.has(id)) return true;
    if (isBlacklisted(it)) return false;
    if (SHRIEKER_BLACKLIST_IDS.has(id)) return false;
    if (num(it?.armorPen ?? 0) >= 5) return false;
    if (s(it?.autofire ?? "") === "No" &&
        [s(it?.trait1??"").trim(),s(it?.trait2??"").trim(),s(it?.trait3??"").trim()].includes("폭발성")) return false;
    // req.range 충족 여부
    const r = it?.range ?? "";
    const rangeVal = isNaN(Number(r)) ? 0 : Number(r);
    if (rangeVal < 2) return false;
    return true;
  });

  // 건쉽 req.range = 3
  const GUNSHIP_BLACKLIST_IDS = new Set([
    "se_sp_las58","st_sw_mg43","st_sw_arc3","st_sw_rl77",
    "st_sw_s11","st_sw_ms11","st_sw_m1000","st_sw_eat700","st_sw_eat411",
    "st_vh_td220","st_st_mg43","st_st_g16","st_st_ac8",
  ]);
  const GUNSHIP_BLACKLIST_WT  = new Set(["돌격소총","기관단총","산탄총"]);
  const GUNSHIP_WHITELIST_IDS = new Set(["th_sp_g50"]);
  const hasGunshipCounter = allLoadoutItems.some(it => {
    const id = s(it?.id ?? "");
    const wt = s(it?.weaponType ?? "");
    if (GUNSHIP_WHITELIST_IDS.has(id)) return true;
    if (isBlacklisted(it)) return false;
    if (GUNSHIP_BLACKLIST_IDS.has(id)) return false;
    if (GUNSHIP_BLACKLIST_WT.has(wt)) return false;
    const r = it?.range ?? "";
    const rangeVal = isNaN(Number(r)) ? 0 : Number(r);
    if (rangeVal < 3) return false;
    return true;
  });

  // 스팅레이 req.range = 3
  const STINGRAY_BLACKLIST_IDS = new Set([
    "se_sp_las58","st_sw_arc3","st_sw_rl77",
    "st_sw_s11","st_sw_ms11","st_sw_m1000","st_sw_eat700","st_sw_eat411",
    "st_vh_td220","st_st_mg43","st_st_g16","st_st_ac8","st_st_mls4x",
  ]);
  const STINGRAY_BLACKLIST_WT = new Set(["기관단총","산탄총"]);
  const hasStingrayCounter = allLoadoutItems.some(it => {
    const id = s(it?.id ?? "");
    const wt = s(it?.weaponType ?? "");
    if (isBlacklisted(it)) return false;
    if (STINGRAY_BLACKLIST_IDS.has(id)) return false;
    if (STINGRAY_BLACKLIST_WT.has(wt)) return false;
    const r = it?.range ?? "";
    const rangeVal = isNaN(Number(r)) ? 0 : Number(r);
    if (rangeVal < 3) return false;
    return true;
  });

  // 비행형 적 경고 판정
  function getFlyingWarning(race, spawnTable) {
    const flying = flyingConfig[race];
    if (!flying) return null;
    // 해당 spawnTable에서는 비행형 적 미등장
    if (spawnTable && flying.excludeSpawnTables.has(spawnTable)) return null;
    const canPen = flying.av === 0 || maxArmorPen >= flying.av;
    let canRange = false;
    if      (flying.name === "슈리커")   canRange = hasShriekerCounter;
    else if (flying.name === "건쉽")     canRange = hasGunshipCounter;
    else if (flying.name === "스팅레이") canRange = hasStingrayCounter;
    else canRange = maxRange >= flying.reqRange;
    if (canPen && canRange) return null;
    return flying;
  }

  // 럽처 변종 — 잠복 상태 대응 가능 여부 판정
  const primaryAndSecondary = [selected?.primary, selected?.secondary].filter(Boolean);
  const supportWeapons = (Array.isArray(selected?.stratagem) ? selected.stratagem : [])
    .filter(it => SUPPORT_SUBTYPES.has(getSubType(it)));
  const RUPTURE_WHITELIST_IDS  = new Set(["st_sw_s11"]);
  const RUPTURE_BLACKLIST_IDS  = new Set(["se_sp_gp20","se_sp_p33"]);
  const hasRuptureCounter = [...primaryAndSecondary, ...supportWeapons].some(it => {
    const id = s(it?.id ?? "");
    if (RUPTURE_WHITELIST_IDS.has(id)) return true;
    if (RUPTURE_BLACKLIST_IDS.has(id)) return false;
    // AP5 이상 지원무기 제외
    if (SUPPORT_SUBTYPES.has(getSubType(it)) && num(it?.armorPen ?? 0) >= 5) return false;
    // 폭발성 또는 플라즈마 trait 포함 여부
    return hasTrait(it, "폭발성", "플라즈마");
  });
  const showRuptureWarning = selectedFaction === "럽처 변종" && !hasRuptureCounter;



  // 종족 목록 (DB 데이터 기반)
  const races = [...new Set(reqDataNorm.map(r => r.race))].filter(Boolean);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* ── 레이더 차트 ── */}
      {!hasAny ? (
        <div style={{ color:"rgba(255,255,255,.45)", fontSize:13, fontWeight:700,
          padding:"48px 0", textAlign:"center", letterSpacing:".02em" }}>
          장비와 스트라타젬을 선택하세요.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, position:"relative" }}>
          {/* 모바일: 전체 평가 항목 설명 버튼 */}
          <button
            type="button"
            className="axisInfoMobileBtn"
            onClick={() => setShowAllTooltip(true)}
            aria-label="평가 항목 설명"
          >?</button>

          {/* 모바일 전체 툴팁 모달 */}
          {showAllTooltip && (
            <div style={{
              position:"fixed", inset:0, zIndex:2200,
              background:"rgba(0,0,0,.82)",
              display:"flex", alignItems:"flex-end", justifyContent:"center",
              padding:"0 0 env(safe-area-inset-bottom,0)",
            }} onClick={() => setShowAllTooltip(false)}>
              <div onClick={e => e.stopPropagation()} style={{
                background:"rgba(14,14,20,.97)",
                border:"1px solid rgba(250,204,21,.35)",
                borderRadius:"14px 14px 0 0",
                padding:"20px 18px 28px",
                width:"100%", maxWidth:480,
                maxHeight:"80vh", overflowY:"auto",
                display:"flex", flexDirection:"column", gap:18,
              }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#facc15", letterSpacing:".04em" }}>
                    평가 항목 설명
                  </span>
                  <button type="button" onClick={() => setShowAllTooltip(false)}
                    style={{ background:"none", border:"none", color:"rgba(255,255,255,.4)",
                      fontSize:18, cursor:"pointer", lineHeight:1, padding:"2px 4px" }}>✕</button>
                </div>
                {Object.values(AXIS_TOOLTIP).map((tip, ti) => (
                  <div key={ti} style={{ borderTop:"1px solid rgba(255,255,255,.07)", paddingTop:14 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:"#facc15", marginBottom:8 }}>{tip.title}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {tip.lines.map((line, li) => (
                        <span key={li} style={{
                          fontSize:11.5, lineHeight:1.55,
                          color: li === 0 ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.52)",
                        }}>{line}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 축 레이블 툴팁 */}
          {axisTooltip && AXIS_TOOLTIP[axisTooltip.key] && (() => {
            const tip = AXIS_TOOLTIP[axisTooltip.key];
            const toRight = axisTooltip.cx <= 160;
            return (
              <div style={{
                position:"absolute",
                left:  toRight ? `${axisTooltip.cx + 12}px` : "auto",
                right: toRight ? "auto" : `calc(100% - ${axisTooltip.cx - 12}px)`,
                top:   `${Math.max(0, axisTooltip.cy - 8)}px`,
                zIndex:200,
                background:"rgba(12,12,18,.97)",
                border:"1px solid rgba(250,204,21,.40)",
                borderRadius:9,
                padding:"10px 13px",
                width:290, maxWidth:"calc(100vw - 32px)",
                pointerEvents:"none",
                boxShadow:"0 6px 24px rgba(0,0,0,.75)",
              }}>
                <div style={{ fontSize:12, fontWeight:800, color:"#facc15",
                  marginBottom:7, letterSpacing:".04em" }}>
                  {tip.title}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                  {tip.lines.map((line, li) => (
                    <span key={li} style={{
                      fontSize:10.5, lineHeight:1.5,
                      color: li === 0 ? "rgba(255,255,255,.70)" : "rgba(255,255,255,.50)",
                    }}>{line}</span>
                  ))}
                </div>
              </div>
            );
          })()}
          <svg viewBox="0 0 320 310" width="100%" style={{ maxWidth:340, overflow:"visible" }}>

            {/* 배경 격자 */}
            {RINGS.map((ratio, ri) => {
              const pts = AXES.map((_, i) => {
                const p = polarToXY(CX, CY, MAX_R * ratio, i);
                return `${p.x},${p.y}`;
              }).join(" ");
              return (
                <polygon key={ri} points={pts} fill="none"
                  stroke={ratio === 1.0 ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.09)"}
                  strokeWidth={ratio === 1.0 ? 1.2 : 0.8} />
              );
            })}

            {/* 요구 수치 오버레이 (팩션 선택 시) */}
            {reqData && (() => {
              const reqAxesData = {
                stability:  reqData.stability,
                vsHorde:    reqData.vsHorde,
                vsAntitank: reqData.antiTank,
                minRange:   reqData.minRange,
                vsTarget:   reqData.vsTarget,
              };
              return (
                <polygon
                  points={makePolygonPoints(CX, CY, MAX_R, reqAxesData)}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={1.5}
                  strokeDasharray="5,3"
                  strokeLinejoin="round"
                />
              );
            })()}

            {/* 축선 */}
            {AXES.map((_, i) => {
              const p = polarToXY(CX, CY, MAX_R, i);
              return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="rgba(255,255,255,.12)" strokeWidth={0.8} />;
            })}

            {/* 레이어 폴리곤
                yellow(개인) → blue(지원) → red(공격) → green(방어) 순으로
                바깥에서 안으로 누적 최대값으로 그림 */}
            {(() => {
              const activeKeys = ["vsHorde","vsTarget","vsAntitank","demolition","stability","minRange"];
              // 렌더 순서: 뒤(바깥)→앞(안쪽) = green→red→blue→yellow
              // 누적은 안쪽(yellow)부터 시작해서 바깥으로
              const renderOrder = [...layers].reverse(); // yellow→blue→red→green
              let cumMax = {};
              activeKeys.forEach(k => { cumMax[k] = 0; });

              // 먼저 각 레이어의 누적 데이터 계산
              const layerDrawData = renderOrder.map(layer => {
                const hasData = activeKeys.some(k => num(layer.data[k] ?? 0) > 0);
                if (!hasData) return { layer, drawData: null };
                const drawData = {};
                activeKeys.forEach(k => {
                  const v = Math.max(0, Math.min(num(layer.data[k] ?? 0), MAX_VAL)); // MAX_VAL cap
                  drawData[k] = Math.max(v, cumMax[k]);
                  cumMax[k] = drawData[k];
                });
                return { layer, drawData };
              });

              // 뒤에서 앞 순서로 렌더 (green→red→blue→yellow)
              return [...layerDrawData].reverse().map(({ layer, drawData }) => {
                if (!drawData) return null;
                return (
                  <polygon key={layer.key}
                    points={makePolygonPoints(CX, CY, MAX_R, drawData)}
                    fill={`${layer.color}0.18)`}
                    stroke={layer.stroke}
                    strokeWidth={1.8}
                    strokeLinejoin="round" />
                );
              });
            })()}

            {/* 축 레이블 — 꼭짓점 끝 바깥에 일관되게 표시 */}
            {AXES.map((ax, i) => {
              const isBottom = i === 2 || i === 3;
              const pLabel = polarToXY(CX, CY, MAX_R + (isBottom ? 30 : 22), i);
              const anchor = Math.abs(pLabel.x - CX) < 8 ? "middle" : pLabel.x < CX ? "end" : "start";
              const labelY = isBottom ? pLabel.y + 18 : pLabel.y + 4;
              const isHov = axisTooltip?.key === ax.key;
              return (
                <text key={i} x={pLabel.x} y={labelY} textAnchor={anchor}
                  fontSize={11} fontWeight={700} fontFamily={FONT}
                  fill={isHov ? "#facc15" : "rgba(255,255,255,.75)"}
                  style={{ cursor:"help" }}
                  onMouseEnter={e => {
                    const svg = e.currentTarget.closest("svg");
                    const sr  = svg?.getBoundingClientRect() ?? { left:0, top:0 };
                    setAxisTooltip({ key:ax.key, cx:e.clientX - sr.left, cy:e.clientY - sr.top });
                  }}
                  onMouseLeave={() => setAxisTooltip(null)}>
                  {ax.label}
                </text>
              );
            })}

            {/* 수치 + 요구치 표시 — 축 레이블 옆에 "현재값 / 요구치" 한 줄로 */}
            {AXES.map((ax, i) => {
              let topLayer = null, topVal = -Infinity;
              for (const layer of [...layers].reverse()) {
                const v = num(layer.data[ax.key] ?? 0);
                if (v > topVal) { topVal = v; topLayer = layer; }
              }
              // 선택된 항목이 없으면 표시 안 함
              if (!topLayer) return null;
              const axMax   = ax.maxVal ?? MAX_VAL;
              const dispVal = Math.max(0, topVal); // 최소 0 표시
              const isOver20 = dispVal > axMax + 5;
              const isOver   = dispVal > axMax;

              const isBottom = i === 2 || i === 3;
              const pLabel = polarToXY(CX, CY, MAX_R + (isBottom ? 30 : 22), i);
              const anchor = Math.abs(pLabel.x - CX) < 8 ? "middle" : pLabel.x < CX ? "end" : "start";
              const labelY = isBottom ? pLabel.y + 18 : pLabel.y + 4;
              const numY   = isBottom ? labelY - 12 : labelY + 13;

              const reqAxesData = reqData ? {
                stability:  reqData.stability,
                vsHorde:    reqData.vsHorde,
                vsAntitank: reqData.antiTank,
                minRange:   reqData.minRange,
                vsTarget:   reqData.vsTarget,
              } : null;
              const reqVal = reqAxesData?.[ax.key];

              const valText = isOver20 ? `${dispVal}++` : isOver ? `${dispVal}+` : dispVal;
              const valColor = isOver ? "#facc15" : "#facc15"; // 항상 노란색
              const valFilter = isOver ? "drop-shadow(0 0 4px #facc15)" : "none";

              return (
                <text key={`val-${i}`} x={pLabel.x} y={numY}
                  textAnchor={anchor} fontSize={10} fontWeight={800}
                  fontFamily={FONT}>
                  <tspan fill={valColor} style={{ filter: valFilter }}>
                    {valText}
                  </tspan>
                  {reqVal != null ? (
                    <tspan fill="rgba(255,255,255,.40)" fontSize={9}> / {reqVal}</tspan>
                  ) : null}
                </text>
              );
            })}
          </svg>

          {/* 범례 */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 12px", justifyContent:"center" }}>
            {[...layers].reverse()
              .filter(l => AXES.some(ax => num(l.data[ax.key] ?? 0) > 0))
              .map(layer => (
                <div key={layer.key} style={{ display:"flex", alignItems:"center", gap:5,
                  fontSize:11, color:"rgba(255,255,255,.70)" }}>
                  <div style={{ width:10, height:10, borderRadius:2,
                    background:layer.stroke, flexShrink:0 }} />
                  {layer.label}
                </div>
              ))}
            {reqData && (
              <div style={{ display:"flex", alignItems:"center", gap:5,
                fontSize:11, color:"rgba(255,255,255,.55)" }}>
                <div style={{ width:10, height:3, borderRadius:1,
                  background:"rgba(255,255,255,.50)", flexShrink:0 }} />
                {reqData.faction} 요구 수치
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 구조물 파괴 수단 부족 경고 ── */}
      {allStratsSelected && !hasDemolition && (
        <div style={{
          padding:"10px 14px", borderRadius:10,
          background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.35)",
          boxShadow:"0 0 12px rgba(239,68,68,.25), 0 0 28px rgba(239,68,68,.12)",
          fontSize:12, fontWeight:700, color:"#fca5a5",
        }}>
          ⚠ 구조물 파괴 수단이 부족합니다.
        </div>
      )}

      {/* ── 팩션별 요구 수치 비교 ── */}
      <div className="tutorialReqSection" style={{ display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#e9e9e9", letterSpacing:".02em" }}>
          팩션별 요구 수치 비교
        </div>

        {/* 종족 선택 — PC: 아이콘+텍스트 / 모바일: 아이콘 꽉 채움 (단일 컴포넌트, CSS로 전환) */}
        <div className="raceSelectWrap">
          {/* PC용: 아이콘+텍스트 pill 버튼 */}
          <div className="raceSelectDesktop">
            {races.map(race => {
              const col = RACE_COLORS[race];
              const isActive = selectedRace === race;
              return (
                <button key={race} type="button"
                  onClick={() => {
                    if (selectedRace === race) { setSelectedRace(null); setSelectedFaction(null); }
                    else { setSelectedRace(race); setSelectedFaction(null); }
                  }}
                  style={{
                    padding:"5px 14px", borderRadius:999,
                    border:`1px solid ${isActive ? col.border : "rgba(255,255,255,.14)"}`,
                    background: isActive ? col.bg : "rgba(255,255,255,.04)",
                    color: isActive ? col.text : "rgba(255,255,255,.55)",
                    fontSize:12, fontWeight:700, cursor:"pointer",
                    transition:"all .15s",
                    display:"flex", alignItems:"center", gap:5,
                  }}>
                  <RaceIcon race={race} size={15} />
                  {race}
                </button>
              );
            })}
            {selectedRace && (
              <button type="button"
                onClick={() => { setSelectedRace(null); setSelectedFaction(null); }}
                style={{
                  padding:"5px 10px", borderRadius:999,
                  border:"1px solid rgba(255,255,255,.12)",
                  background:"transparent",
                  color:"rgba(255,255,255,.35)",
                  fontSize:11, fontWeight:700, cursor:"pointer",
                }}>✕ 초기화</button>
            )}
          </div>
          {/* 모바일용: 아이콘 전용, 동일 너비 3버튼 */}
          <div className="raceSelectMobile">
            {races.map(race => {
              const col = RACE_COLORS[race];
              const isActive = selectedRace === race;
              return (
                <button key={race} type="button"
                  onClick={() => {
                    if (selectedRace === race) { setSelectedRace(null); setSelectedFaction(null); }
                    else { setSelectedRace(race); setSelectedFaction(null); }
                  }}
                  style={{
                    flex:"1 1 0", height:48, borderRadius:12,
                    border:`2px solid ${isActive ? col.border : "rgba(255,255,255,.14)"}`,
                    background: isActive ? col.bg : "rgba(255,255,255,.04)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", transition:"all .15s",
                    boxShadow: isActive ? `0 0 10px ${col.border}` : "none",
                    padding:0,
                  }}>
                  <RaceIcon race={race} size={28} />
                </button>
              );
            })}
            {selectedRace && (
              <button type="button"
                onClick={() => { setSelectedRace(null); setSelectedFaction(null); }}
                style={{
                  flex:"0 0 44px", height:48, borderRadius:12,
                  border:"1px solid rgba(255,255,255,.12)",
                  background:"transparent", color:"rgba(255,255,255,.35)",
                  fontSize:16, cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>✕</button>
            )}
          </div>
        </div>

        {/* 팩션 선택 */}
        {selectedRace && (() => {
          const factions = reqDataNorm.filter(r => r.race === selectedRace);
          const col = RACE_COLORS[selectedRace];
          return (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {factions.map(f => {
                const isActive = selectedFaction === f.faction;
                return (
                  <button key={f.faction} type="button"
                    onClick={() => setSelectedFaction(isActive ? null : f.faction)}
                    style={{
                      padding:"4px 12px", borderRadius:999,
                      border:`1px solid ${isActive ? col.border : "rgba(255,255,255,.10)"}`,
                      background: isActive ? col.bg : "rgba(255,255,255,.04)",
                      color: isActive ? col.text : "rgba(255,255,255,.50)",
                      fontSize:11, fontWeight:700, cursor:"pointer",
                      transition:"all .15s",
                    }}>
                    {f.faction}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* 팩션 선택 시 수치 비교 표 */}
        {reqData && (() => {
          // 현재 로드아웃 최고 레이어 (공격+방어 중 높은 것)
          const bestLayer = {
            stability:  Math.max(layers[0].data.stability,  layers[1].data.stability),
            vsHorde:    Math.max(layers[0].data.vsHorde,    layers[1].data.vsHorde),
            vsAntitank: Math.max(layers[0].data.vsAntitank, layers[1].data.vsAntitank),
            minRange:   Math.max(layers[0].data.minRange ?? 0, layers[1].data.minRange ?? 0),
            vsTarget:   Math.max(layers[0].data.vsTarget,   layers[1].data.vsTarget),
          };
          const reqMap = {
            stability:  reqData.stability,
            vsHorde:    reqData.vsHorde,
            vsAntitank: reqData.antiTank,
            minRange:   reqData.minRange ?? 0,
            vsTarget:   reqData.vsTarget,
          };
          const labels = { stability:"안정성", vsHorde:"대물량", vsAntitank:"대전차", minRange:"난전 수행", vsTarget:"원거리 대응" };
          const col = RACE_COLORS[selectedRace];

          return (
            <div style={{
              background:"rgba(255,255,255,.04)", border:`1px solid ${col.border}`,
              borderRadius:10, padding:"10px 12px",
              display:"flex", flexDirection:"column", gap:6,
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:col.text, marginBottom:2, display:"flex", alignItems:"center", flexWrap:"wrap", gap:6 }}>
                <RaceIcon race={selectedRace} faction={reqData.faction} size={18} /> {reqData.faction} — 권장 수치
                {getFlyingWarning(selectedRace, reqData.faction) && (
                  <span style={{
                    color:"#ff4444", fontSize:12, fontWeight:800,
                    animation:"flyingWarn 1.2s ease-in-out infinite",
                    filter:"drop-shadow(0 0 6px #ff4444)",
                  }}>
                    ⚠ {getFlyingWarning(selectedRace, reqData.faction).name} 대응 불가
                  </span>
                )}
                {showRuptureWarning && (
                  <span style={{
                    color:"#ff4444", fontSize:12, fontWeight:800,
                    animation:"flyingWarn 1.2s ease-in-out infinite",
                    filter:"drop-shadow(0 0 6px #ff4444)",
                  }}>
                    ⚠ 잠복 상태 대응 불가능
                  </span>
                )}
              </div>
              <style>{`
                @keyframes flyingWarn {
                  0%, 100% { opacity:1; filter:drop-shadow(0 0 6px #ff4444); }
                  50% { opacity:0.4; filter:drop-shadow(0 0 2px #ff4444); }
                }
              `}</style>
              {AXES.map(ax => {
                const loadout = bestLayer[ax.key] || 0;
                const req     = reqMap[ax.key] || 0;
                const ratio   = req > 0 ? loadout / req : 1;
                const pct     = Math.min(ratio, 1);
                // 달성률 구간별 색상
                const barColor = ratio >= 1    ? "#4ade80"   // 100% 이상 — 초록
                               : ratio >= 0.95 ? "#4ade80"   // 95~100% — 초록 (동일)
                               : ratio >= 0.70 ? "#facc15"   // 70~95%  — 노란색
                               : ratio >= 0.50 ? "#fb923c"   // 50~70%  — 주황색
                               :                 "#f87171";  // 50% 미만 — 빨간색
                return (
                  <div key={ax.key} style={{ display:"grid", gridTemplateColumns:"72px 1fr 52px", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.55)" }}>{labels[ax.key]}</span>
                    <div style={{ height:5, borderRadius:99, background:"rgba(255,255,255,.08)", overflow:"hidden" }}>
                      <div style={{
                        height:"100%", borderRadius:99,
                        width:`${pct * 100}%`,
                        background: barColor,
                        transition:"width .3s ease",
                      }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, textAlign:"right", color: barColor }}>
                      {loadout} / {req}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── 기타 분석 (교전 범위 / 구조물·기동력) ── */}
      {(() => {
        /* 공용 계산 */
        const BASE_DF = 20;
        const reqDemoAmt = reqData ? (reqData.demolitionNum ?? 0) : 0;
        const usableDemoNum = demoItems
          .filter(it => it.demoStr >= BASE_DF)
          .reduce((sum, it) => sum + it.demoNum, 0);
        const demoRatio = reqDemoAmt > 0 ? usableDemoNum / reqDemoAmt : 1;
        const demoGrade =
          demoRatio >= 0.70 ? { label:"충분", color:"#4ade80", bg:"rgba(74,222,128,.15)" } :
          demoRatio >= 0.50 ? { label:"적당", color:"#facc15", bg:"rgba(250,204,21,.15)" } :
                              { label:"부족", color:"#f87171", bg:"rgba(248,113,113,.15)" };
        const needsHardDemo   = reqData ? (reqData.hardDemo ?? 0) >= 1 : false;
        const HARD_DEMO_THRES = selectedRace === "테르미니드" ? 40 : 50;
        const hasHardDemo     = demoItems.some(it => it.demoStr >= HARD_DEMO_THRES);
        const strongGrade = !needsHardDemo ? null
          : hasHardDemo
            ? { label:"보유", color:"#4ade80", bg:"rgba(74,222,128,.15)" }
            : { label:"없음", color:"#f87171", bg:"rgba(248,113,113,.15)" };
        const showDemo = reqData && (reqDemoAmt > 0 || strongGrade);

        /* 공용 렌더 헬퍼 */
        const tag = (label, color, bg) => (
          <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:999,
            background:bg, color, border:`1px solid ${color}44`, whiteSpace:"nowrap" }}>{label}</span>
        );
        const SubLabel = ({ children }) => (
          <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.40)",
            marginBottom:5, letterSpacing:".04em" }}>{children}</div>
        );
        const GradeRow = ({ label, grade }) => (
          <div style={{ display:"flex", alignItems:"center",
            gap:8, padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,.55)",
              flex:1 }}>{label}</span>
            <span style={{ marginLeft:"auto", flexShrink:0 }}>
              {tag(grade.label, grade.color, grade.bg)}
            </span>
          </div>
        );

        /* 교전 범위 블록 */
        const RangeBlock = (
          <div style={{ flex:"1 1 160px", minWidth:0 }}>
            <SubLabel>교전 범위</SubLabel>
            {rangeInfoWithPassive.length === 0
              ? <span style={{ fontSize:11, color:"rgba(255,255,255,.28)" }}>미선택</span>
              : <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {rangeInfoWithPassive.map(({ slot, name, pen, ergo, isThrowable, it, passiveNotes }, idx) => (
                <div key={`${slot}-${idx}`} style={{ display:"flex", alignItems:"flex-start", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,.45)", fontWeight:700, minWidth:42, paddingTop:2 }}>
                    {slot === "지원무기" && name ? name : slot}
                  </span>
                  <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:0 }}>
                    {/* AP / Ergo 배지 행 */}
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {pen && (pen.pens ?? [pen]).map((p, pi) => (
                        <span key={pi} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999,
                          background:getPenBg(p.raw), color:getPenColor(p.raw) }}>
                          {p.label}
                        </span>
                      ))}
                      {ergo && (() => {
                        if (isThrowable && ergo.label === "투척") {
                          return (
                            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999,
                              background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.20)", color:"rgba(255,255,255,.75)" }}>
                              투척
                            </span>
                          );
                        }
                        const es = getErgoStyle(ergo.label, ergo.upgraded);
                        if (!es) return null;
                        return (
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999,
                            background:es.bg, border:`1px solid ${es.border}`, color:es.color }}>
                            핸들링 {ergo.label}{ergo.upgraded ? " ↑" : ""}
                          </span>
                        );
                      })()}
                    </div>
                    {/* 방어구 패시브 효과 */}
                    {passiveNotes.length > 0 && (
                      <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                        {passiveNotes.map((note, ni) => {
                          const text = typeof note === "string" ? note : note.text;
                          const kind = typeof note === "string" ? "pos" : note.kind;
                          return (
                            <span key={ni} style={{
                              fontSize:11, fontWeight:600,
                              color: kind === "pos2" ? "#a78bfa"
                                   : kind === "neg"  ? "#f87171"
                                   :                  "#86efac",
                            }}>
                              {kind === "pos2" ? `++ ${text}` : kind === "neg" ? `- ${text}` : `+ ${text}`}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        );

        /* 구조물 + 기동력 블록 */
        // ── 방어구 개인 효과 계산 — armorpassive.txt 기준 ──
        const armorPersonalNotes = (() => {
          if (!armorPassive) return [];
          const p  = (text) => ({ text, kind:"pos"  });
          const p2 = (text) => ({ text, kind:"pos2" });
          const ng = (text) => ({ text, kind:"neg"  });
          const notes = [];
          const allIds = [selected.primary, selected.secondary, selected.throwable,
            ...(Array.isArray(selected.stratagem) ? selected.stratagem : [])].filter(Boolean).map(it => s(it?.id??"")); 
          const hasP11 = allIds.some(id => id.toLowerCase().includes("sp_p11"));

          switch (armorPassive) {
            case "추가 완충제":
              notes.push(p2("받는 피해 감소")); break;
            case "정찰":
              notes.push(p("탐지 범위 감소"), p("원거리 적 탐지")); break;
            case "구급 키트":
              if (hasP11) notes.push(p("각성제 지속시간"));
              notes.push(p("각성제 최대 소지수"), p("각성제 초기 보유량")); break;
            case "민주주의의 가호":
              notes.push(p("확률적으로 사망 방지"), p("흉부 출혈 피해 제거")); break;
            case "결연함":
              notes.push(p("받는 피해 감소"), p2("피격 시 카메라 흔들림 95% 감소"), p("원거리 적 탐지")); break;
            case "통합 폭발물":
              notes.push(ng("사망시 자폭")); break;
            case "탄도 완충제":
              notes.push(p("상체에 받는 피해 감소"), p("폭발 피해 감소"), p("흉부 출혈 피해 제거")); break;
            case "강화된 견장":
              notes.push(p("확률적으로 사지 부상 방지")); break;
            case "아드레노-제세동기":
              if (hasP11) notes.push(p("각성제 지속시간"));
              notes.push(p("사지 부상이 없는 상태로 사망시 일시적 소생")); break;
            case "발 먼저":
              notes.push(p("다리 부상 방지"), p("관심 지역 탐지 범위 증가"), p("행동에 의한 소음 감소")); break;
            case "굳건한 바위":
              notes.push(p("레그돌 억제")); break;
            case "신호 감소":
              notes.push(p("탐지 범위 감소"), p("행동에 의한 소음 감소")); break;
            case "보급 아드레날린":
              notes.push(p("받는 피해 감소"), p("피해를 받으면 스태미나 회복")); break;
            case "충격 방지 패드, 강화 버전":
              notes.push(p("받는 피해 감소")); break;
            case "산소공급기":
              notes.push(p("걷기/달리기 속도 증가"), p("슬라이딩 거리 증가"), ng("스태미나 소모량 증가")); break;
            default: break;
          }
          return notes;
        })();

        const RightBlock = (
          <div style={{ flex:"1 1 160px", minWidth:0, display:"flex", flexDirection:"column", gap:10 }}>
            {/* 구조물 파괴 — 항상 표시, 헤더 제거 */}
            {(reqDemoAmt > 0 || needsHardDemo) && (
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {reqDemoAmt > 0 && <GradeRow label="구조물 파괴용 자원" grade={demoGrade} />}
                {needsHardDemo  && <GradeRow label="고위력 파괴수단"
                  grade={strongGrade ?? { label:"없음", color:"#f87171", bg:"rgba(248,113,113,.15)" }} />}
              </div>
            )}
            {/* 방어구 개인 효과 — 항상 표시 */}
            <div>
              <SubLabel>방어구 개인 효과</SubLabel>
              {armorPersonalNotes.length === 0
                ? <span style={{ fontSize:11, color:"rgba(255,255,255,.28)" }}>없음</span>
                : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {armorPersonalNotes.map((n, i) => (
                      <span key={i} style={{
                        fontSize:11, fontWeight:600,
                        color: n.kind === "pos2" ? "#a78bfa"
                             : n.kind === "neg"  ? "#f87171"
                             :                    "#86efac",
                      }}>
                        {n.kind === "pos2" ? `++ ${n.text}`
                         : n.kind === "neg" ? `- ${n.text}`
                         :                   `+ ${n.text}`}
                      </span>
                    ))}
                  </div>
                )
              }
            </div>
            <div>
              <SubLabel>기동력</SubLabel>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:13, fontWeight:700, padding:"3px 12px", borderRadius:999,
                  ...getMobilityStyle(mobilityTotal) }}>
                  {mobilityTotal > 0 ? "빠름" : mobilityTotal < 0 ? "느림" : "표준"}
                  {mobilityTotal !== 0 && ` (${mobilityTotal > 0 ? "+" : ""}${mobilityTotal})`}
                </span>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {mobilityBase    !== 0 && <span style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>방어구 {mobilityBase > 0 ? "+1" : "-1"}</span>}
                  {mobilityPassive !== 0 && <span style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>· 패시브 +1</span>}
                  {mobilityStrat   !== 0 && <span style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>· 이동 보조 +1</span>}
                </div>
              </div>
            </div>
          </div>
        );

        return (
          <div className="tutorialRangeSection" style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)",
            borderRadius:10, padding:"10px 12px" }}>
            {/* 데스크탑: 교전 범위(좌) | 구조물+기동력(우) 2열 */}
            {/* 모바일:   구조물(상단 전체) | 교전범위+방어구효과(하단) */}
            <div className="analysisBottomGrid">
              {RangeBlock}
              {RightBlock}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

/* ── 스타일 헬퍼 ── */
function getPenBg(raw) {
  const m = { "2":"#565656","3":"#cd8527","4":"#cd8527","5":"#8a080d","6":"#8a080d",
    "7":"#6b0c0f","8":"#6b0c0f","9":"#1a1a1a","10":"#1a1a1a","비살상":"#1a3a5c" };
  return m[raw] || "#333";
}
function getPenColor(raw) {
  const m = { "2":"#e8e8e8","3":"#fff3e0","4":"#fff3e0","5":"#ffd0d2","6":"#ffd0d2",
    "7":"#ffb3b6","8":"#ffb3b6","9":"#ff9ea2","10":"#ff9ea2","비살상":"#a8d4ff" };
  return m[raw] || "#fff";
}
function getMobilityStyle(val) {
  if (val > 0) return { background:"rgba(134,239,172,.15)", border:"1px solid rgba(134,239,172,.40)", color:"#86efac" };
  if (val < 0) return { background:"rgba(248,113,113,.15)", border:"1px solid rgba(248,113,113,.40)", color:"#f87171" };
  return { background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.20)", color:"rgba(255,255,255,.75)" };
}
