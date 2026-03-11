import { useEffect, useState } from "react";

const s = (v) => (v == null ? "" : String(v));

/* ── armorPen 색상 ── */
const ARMOR_PEN_STYLE = {
  "2":    { bg:"#565656",  color:"#e8e8e8" },
  "3":    { bg:"#cd8527",  color:"#fff3e0" },
  "4":    { bg:"#cd8527",  color:"#fff3e0" },
  "5":    { bg:"#8a080d",  color:"#ffd0d2" },
  "6":    { bg:"#8a080d",  color:"#ffd0d2" },
  "7":    { bg:"#6b0c0f",  color:"#ffb3b6" },
  "8":    { bg:"#6b0c0f",  color:"#ffb3b6" },
  "9":    { bg:"#1a1a1a",  color:"#ff9ea2" },
  "10":   { bg:"#1a1a1a",  color:"#ff9ea2" },
  "비살상":{ bg:"#1a3a5c", color:"#a8d4ff" },
};
const ARMOR_PEN_LABEL = {
  "2":"경장갑 관통","3":"일반 장갑 관통","4":"중장갑 관통",
  "5":"대전차1","6":"대전차2","7":"대전차3",
  "8":"대전차4","9":"대전차5","10":"대전차6",
};
/* ── 방어구 등급 설명 ── */
const ARMOR_GRADE_DESC = {
  "경량": "방어력을 희생해 기동력을 높입니다.",
  "일반": "균형 잡힌 기동력과 방어력을 가졌습니다.",
  "중량": "기동력을 희생해 방어력을 높입니다.",
};
/* ── 패시브 설명 ── */
const PASSIVE_DESC = {
  "추가 완충제":      "장갑 등급 +50",
  "정찰":             "적 탐지 범위 30% 감소, 맵 마커 배치시 2초 간격으로 적 스캔",
  "강화":             "폭발 피해 50% 감소, 자세별 반동 30% 감소",
  "공병 키트":        "수류탄 초기/최대 수량 2개 증가, 자세별 반동 30% 감소",
  "구급 키트":        "각성제 초기/최대 수량 2개 증가, 각성제 지속시간 2초 증가",
  "민주주의의 가호":  "흉부 출혈 피해 무효, 50% 확률로 사망하지 않음.",
  "서보 보조":        "투척 비거리 30% 증가, 사지 체력 50% 증가",
  "전도성":           "아크 피해량 95% 감소",
  "이상적인 체형":    "핸들링 30 증가, 근접 피해량 40% 증가",
  "인화성 물질":      "화염 피해량 75% 감소",
  "고급 여과":        "가스 피해량 80% 감소",
  "결연함":           "피격시 카메라 흔들림 95% 감소, 장갑 등급 +25, 맵 마커 배치시 2초 간격으로 적 스캔",
  "포위 준비 완료":   "주무기 재장전 속도 30% 증가, 추가 탄약 20% 증가(배낭 지원무기 제외)",
  "통합 폭발물":      "수류탄 초기/최대 수량 2개 증가, 사망시 시체 폭발",
  "총잡이":           "보조무기 재장전 속도 40% 증가, 전환 속도 50% 증가, 반동 70% 감소",
  "탄도 완충제":      "흉부 한정 피해 25% 감소, 폭발 피해 25% 감소, 흉부 출혈 피해 무효",
  "강화된 견장":      "주무기 재장전 속도 30% 증가, 근접 피해량 20% 증가, 50% 확률로 사지 부상 방지",
  "아드레노-제세동기":"각성제 지속시간 2초 증가, 아크 피해량 50% 감소, 신체가 온전한 상태에서 사망시 시한부 부활",
  "발 먼저":          "소음 범위 50% 감소, 관심 지역 탐지 범위 30% 증가, 다리 부상 면역",
  "사막 돌격대":      "상태이상 피해 40% 감소, 투척 비거리 20% 증가",
  "굳건한 바위":      "근접 피해량 40% 증가, 레그돌 저항치 상승",
  "적응력":           "상태이상 피해 50% 감소",
  "신호 감소":        "소음 범위 50% 감소, 적 탐지 범위 40% 감소",
  "보급 아드레날린":  "피해를 받으면 스태미나 회복, 장갑 등급 +25",
};

const TRAIT_BG = {
  "소이":"#ffcfc9","폭발성":"#ffc8aa","레이저":"#ffe5a0",
  "플라즈마":"#e6cff2","아크":"#0a53a8","가스":"#d4edbc",
  "기절":"#d4edbc","치유":"#d4edbc",
  "한 손 파지":"#e8e8e8","단발 장전":"#e8e8e8","탄종/발사형식 변경":"#e8e8e8",
  "차지 업":"#e8e8e8","과열":"#e8e8e8","총검":"#e8e8e8","소음기":"#e8e8e8",
};
const TRAIT_COLOR_DEFAULT = "#e8eaed";
const TRAIT_TEXT = {
  "아크":"#ffffff",
  "한 손 파지":"#1a1a1a","단발 장전":"#1a1a1a","탄종/발사형식 변경":"#1a1a1a",
  "차지 업":"#1a1a1a","과열":"#1a1a1a","총검":"#1a1a1a","소음기":"#1a1a1a",
};
const TAG_TOOLTIP = {
  "소이":"대상에게 유효한 사격을 가하면 불을 붙여 지속 피해를 줍니다.",
  "폭발성":"구조물 파괴가 가능합니다. 폭발과 가까운 곳에서 피해를 받을 수 있으므로 주의하세요.",
  "레이저":"사격에 의해 발생한 열을 관리하면 무한히 발사가 가능합니다.",
  "플라즈마":"구조물 파괴가 불가능한 폭발 피해를 줍니다. 거리에 따라 투사체 속도가 느려집니다.",
  "아크":"제한된 사거리를 가진 아크를 무한히 발사할 수 있습니다.",
  "가스":"대부분의 소형 및 중형 적에게 피해를 주는 부식성 가스로, 대상을 혼란 상태로 만듭니다.",
  "방어막":"일시적인 방어막을 전개해 폭발과 고속 투사체를 방어합니다. 저속 물체는 막을 수 없습니다.",
  "유도":"대상을 자동으로 추적합니다.",
  "기절":"기절 효과를 줘 적을 잠시 멈추게 만듭니다.",
  "치유":"피아식별 없이 대상을 치유합니다.",
  "한 손 파지":"한 손으로 물건을 운송하는 중에도 무기를 사용할 수 있습니다.",
  "단발 장전":"무기를 한 발씩 장전합니다.",
  "탄종/발사형식 변경":"무기에 발사형식이나 탄종을 변경하는 기능이 있습니다.",
  "차지 업":"충전해서 발사할 수 있습니다.",
  "과열":"사격시 무기가 과열되면 장갑 관통력이 상승합니다.(최대 중장갑 관통까지)",
  "총검":"총검이 장착되어있어 근접 공격의 장갑 관통력과 피해량이 상승합니다.",
  "소음기":"적이 가까운 거리에서도 격발 소음을 탐지할 수 없게 됩니다.",
};

function getTraitStyle(trait) {
  return { bg:TRAIT_BG[trait]||TRAIT_COLOR_DEFAULT, color:TRAIT_TEXT[trait]||"#1a1a1a" };
}
function getArmorPenInfo(it) {
  const raw=s(it?.armorPen??"");
  if (!raw) return null;
  const id=s(it?.id??"").toLowerCase();
  // armorPen이 "가스"이면 관통 태그 미표시 — 단 sw_s11, sp_p35는 예외
  if (raw==="가스" && !id.includes("sw_s11") && !id.includes("sp_p35")) return null;
  // sp_g4(가스 수류탄)는 관통 등급 태그 미표시
  if (id.includes("sp_g4")) return null;
  return { label:ARMOR_PEN_LABEL[raw]||raw, ...(ARMOR_PEN_STYLE[raw]||{bg:"#333",color:"#fff"}) };
}
function getWeaponTraits(it) {
  return [s(it?.trait1??""),s(it?.trait2??""),s(it?.trait3??"")].filter(Boolean);
}

/* ── 작은 뱃지 — 모바일 터치 툴팁 지원 ── */
function Badge({ label, bg, color, title: tt }) {
  const [showTip, setShowTip] = useState(false);
  const tooltip = tt || label;
  return (
    <span
      title={tooltip}
      onClick={e => { e.stopPropagation(); setShowTip(v => !v); }}
      style={{
        display:"inline-block", padding:"2px 7px", borderRadius:"999px",
        fontSize:11, fontWeight:500, whiteSpace:"nowrap", cursor:"pointer",
        background:bg||"rgba(255,255,255,0.08)",
        border:`1px solid ${bg||"rgba(255,255,255,0.14)"}`,
        color:color||"rgba(255,255,255,0.75)",
        position:"relative",
      }}>
      {label}
      {showTip && tooltip !== label && (
        <span style={{
          position:"absolute", bottom:"calc(100% + 6px)", left:"50%",
          transform:"translateX(-50%)",
          background:"rgba(20,20,20,.97)", color:"rgba(255,255,255,.9)",
          border:"1px solid rgba(255,255,255,.15)", borderRadius:8,
          padding:"6px 10px", fontSize:11, lineHeight:1.5,
          whiteSpace:"normal", width:200, textAlign:"left",
          zIndex:999, pointerEvents:"none",
          boxShadow:"0 4px 16px rgba(0,0,0,.5)",
        }}>
          {tooltip}
        </span>
      )}
    </span>
  );
}

const WEAPON_KINDS = new Set(["primary","secondary","throwable"]);

/* ── 2번 이미지 레이아웃
   현재 선택 | 프리셋명
   ─────────────────────
   스트라타젬
   #1  [이름 / 미선택]
       [desc 한줄]
   #2  ...
   #3  ...
   #4  ...
   ─────────────────────
   개인 장비
   방어구  [이름]
           [뱃지들]
   주무기  [이름]
           [뱃지들]
   보조무기 [이름]
           [뱃지들]
   투척무기 [이름]
           [뱃지들]
*/
export default function SelectedPanel({ selected, activeLoadoutName }) {
  const sel   = selected || { stratagem:[null,null,null,null], armor:null, primary:null, secondary:null, throwable:null };
  const strat = Array.isArray(sel.stratagem) ? sel.stratagem : [null,null,null,null];

  return (
    <div className="selectedPanel">
      {/* 타이틀 행 */}
      <div className="selectedTitleRow">
        <span className="selectedTitle">현재 선택</span>
        {activeLoadoutName && (
          <>
            <span className="selectedTitleSep">|</span>
            <span className="selectedTitlePreset">"{activeLoadoutName}"</span>
          </>
        )}
      </div>

      {/* 스트라타젬 섹션 */}
      <div className="selSection">
        <div className="selSectionLabel">스트라타젬</div>
        {strat.map((it,i) => (
          <div key={i} className="selRow">
            <span className="selRowNum">#{i+1}</span>
            <div className="selRowContent">
              {!it
                ? <span className="selEmpty">미선택</span>
                : <>
                    <div className="selName">{s(it.name_ko)||"이름 없음"}</div>
                    {it.desc && <div className="selDesc">{s(it.desc)}</div>}
                  </>
              }
            </div>
          </div>
        ))}
      </div>

      <div className="selectedDivider" />

      {/* 개인 장비 섹션 */}
      <div className="selSection">
        <div className="selSectionLabel">개인 장비</div>
        {[
          {key:"armor",    label:"방어구" },
          {key:"primary",  label:"주무기" },
          {key:"secondary",label:"보조무기"},
          {key:"throwable",label:"투척무기"},
        ].map(({key,label}) => {
          const it = sel[key];
          const isWeapon = WEAPON_KINDS.has(key);
          return (
            <div key={key} className="selRow selRowGear">
              <span className="selRowLabel">{label}</span>
              <div className="selRowContent">
                {!it
                  ? <span className="selEmpty">미선택</span>
                  : <>
                      <div className="selName">{s(it.name_ko)||"이름 없음"}</div>
                      {/* 방어구: armorValue + passive */}
                      {key==="armor" && (it.armorValue||it.passive) && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:3}}>
                          {it.armorValue && (
                            <Badge
                              label={s(it.armorValue)}
                              title={ARMOR_GRADE_DESC[s(it.armorValue)] || s(it.armorValue)}
                            />
                          )}
                          {it.passive && (
                            <Badge
                              label={s(it.passive)}
                              bg="rgba(240,196,0,0.15)"
                              color="var(--yellow)"
                              title={PASSIVE_DESC[s(it.passive)] || s(it.passive)}
                            />
                          )}
                        </div>
                      )}
                      {/* 무기: armorPen + traits */}
                      {isWeapon && (() => {
                        const pen=getArmorPenInfo(it);
                        const traits=getWeaponTraits(it);
                        if (!pen&&!traits.length) return null;
                        return (
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:3}}>
                            {pen && <Badge label={pen.label} bg={pen.bg} color={pen.color} title={pen.label} />}
                            {traits.map(t => {
                              const ts=getTraitStyle(t);
                              return <Badge key={t} label={t} bg={ts.bg} color={ts.color} title={TAG_TOOLTIP[t]||t} />;
                            })}
                          </div>
                        );
                      })()}
                    </>
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
