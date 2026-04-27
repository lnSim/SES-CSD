import { useEffect, useState } from "react";

const s = (v) => String(v ?? "").trim();

function normalizeIconPath(p) {
  if (!p) return "";
  const v = String(p).trim();
  if (!v) return "";
  if (v.startsWith("/") || /^https?:\/\//i.test(v)) return v;
  return `/${v}`;
}

/* ── 아이템 sheet 기반 단일 확장자 결정 ──
 * stratagem → .svg 단일
 * armor / weapon 등 → .png 단일
 */
function resolveExt(sheet) {
  return String(sheet || "").toLowerCase() === "stratagem" ? ".svg" : ".png";
}
function forceExt(url, ext) {
  return url.replace(/\.(png|svg|webp)$/i, ext);
}

function SlotImg({ src, alt, className, style, sheet }) {
  const raw     = normalizeIconPath(src) || "/icons/_default.png";
  const ext     = resolveExt(sheet);
  const primary = forceExt(raw, ext);
  const [dead, setDead] = useState(false);
  useEffect(() => { setDead(false); }, [primary]);
  if (dead) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      width:"100%", height:"100%", color:"rgba(255,255,255,0.15)", fontSize:11 }}>?</div>
  );
  return (
    <img className={className} src={primary} alt={alt} draggable={false}
      style={{ background:"transparent", ...style }}
      onError={() => { setDead(true); }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
 * 공통 상수 (SelectedPanel.jsx 와 동일하게 유지)
 * ───────────────────────────────────────────────────────────── */

/* 관통 등급 라벨 (2번 요청: 2=경장갑 관통, 3=일반 장갑 관통, 4=중장갑 관통) */
const ARMOR_PEN_LABEL = {
  "2":"경장갑 관통", "3":"일반 장갑 관통", "4":"중장갑 관통",
  "5":"대전차1","6":"대전차2","7":"대전차3",
  "8":"대전차4","9":"대전차5","10":"대전차6",
};
/* 관통 등급 색상 (SelectedPanel의 ARMOR_PEN_STYLE과 동일) */
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
/* 특성 태그 색상 (SelectedPanel의 TRAIT_BG / TRAIT_TEXT와 동일) */
const TRAIT_BG = {
  "소이":   "#ffcfc9", "폭발성": "#ffc8aa", "레이저": "#ffe5a0",
  "플라즈마":"#e6cff2", "아크":   "#0a53a8", "가스":   "#d4edbc",
  "기절":   "#d4edbc", "치유":   "#d4edbc",
  "한 손 파지":"#e8e8e8","단발 장전":"#e8e8e8","탄종/발사형식 변경":"#e8e8e8",
  "차지 업":"#e8e8e8","과열":"#e8e8e8","총검":"#e8e8e8","소음기":"#e8e8e8",
};
const TRAIT_TEXT_DARK = {
  "아크":"#ffffff",
  "한 손 파지":"#1a1a1a","단발 장전":"#1a1a1a","탄종/발사형식 변경":"#1a1a1a",
  "차지 업":"#1a1a1a","과열":"#1a1a1a","총검":"#1a1a1a","소음기":"#1a1a1a",
};
const TRAIT_COLOR_DEFAULT = "#e8eaed";

function getTraitStyle(t) {
  return { bg: TRAIT_BG[t] || TRAIT_COLOR_DEFAULT, color: TRAIT_TEXT_DARK[t] || "#1a1a1a" };
}

/* 6~21번: 태그 툴팁 설명 */
const TAG_TOOLTIP = {
  "소이":            "대상에게 유효한 사격을 가하면 불을 붙여 지속 피해를 줍니다.",
  "폭발성":          "구조물 파괴가 가능합니다. 폭발과 가까운 곳에서 피해를 받을 수 있으므로 주의하세요.",
  "레이저":          "사격에 의해 발생한 열을 관리하면 무한히 발사가 가능합니다.",
  "플라즈마":        "구조물 파괴가 불가능한 폭발 피해를 줍니다. 거리에 따라 투사체 속도가 느려집니다.",
  "아크":            "제한된 사거리를 가진 아크를 무한히 발사할 수 있습니다.",
  "가스":            "가스 피해를 줘 적을 혼란 상태로 만듭니다.",
  "기절":            "기절 효과를 줘 적을 잠시 멈추게 만듭니다.",
  "치유":            "피아식별 없이 대상을 치유합니다.",
  "한 손 파지":      "한 손으로 물건을 운송하는 중에도 무기를 사용할 수 있습니다.",
  "단발 장전":       "무기를 한 발씩 장전합니다.",
  "탄종/발사형식 변경":"무기에 발사형식이나 탄종을 변경하는 기능이 있습니다.",
  "차지 업":         "충전해서 발사할 수 있습니다.",
  "과열":            "사격시 무기가 과열되면 장갑 관통력이 상승합니다.(최대 중장갑 관통까지)",
  "총검":            "총검이 장착되어있어 근접 공격의 장갑 관통력과 피해량이 상승합니다.",
  "소음기":          "적이 가까운 거리에서도 격발 소음을 탐지할 수 없게 됩니다.",
};

export default function Slot({
  kind = "", def, picked, onClick, onClear,
  clearMode = "x", isPickerActive = false,
  warnBackpack = false, hideName = false,
}) {
  const has         = !!picked;
  const isStratagem = kind === "stratagem";
  const isArmor     = kind === "armor";
  const isPrimary   = kind === "primary";

  const armorTag   = s(picked?.armorValue ?? "");
  const passiveTag = s(picked?.passive    ?? "");
  const traits     = picked ? [s(picked.trait1),s(picked.trait2),s(picked.trait3)].filter(Boolean) : [];

  const armorPenRaw   = s(picked?.armorPen ?? "");
  const armorPenLabel = armorPenRaw ? (ARMOR_PEN_LABEL[armorPenRaw] || armorPenRaw) : "";
  const armorPenStyle = armorPenRaw ? (ARMOR_PEN_STYLE[armorPenRaw] || { bg:"#333", color:"#fff" }) : null;

  /* 주무기 첫 번째 pill = weaponType (무기 소분류) */
  const weaponType = s(picked?.weaponType ?? "");

  const kindClass = kind && !isStratagem
    ? `slot${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
    : "";

  return (
    <div
      className={["slotCard", has?"picked":"", isStratagem?"slotStratagem":"", kindClass, isPickerActive?"pickerActive":""].filter(Boolean).join(" ")}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if(e.key==="Enter"||e.key===" ") onClick?.(); }}
      title={has ? `${picked.name_ko||""}\n${picked.desc||""}` : "클릭해서 선택"}
    >

      {/* ── 방어구 ── */}
      {isArmor && (
        <>
          {/* 1행: 타이틀 + 장비 해제 */}
          <div className="slotTop slotTopArmor">
            <div className="slotTitle">{def.titleKo}</div>
            <div className="slotTopArmorRight">
              {has && (
                <button className="slotClearText" onClick={e=>{e.stopPropagation();onClear();}} type="button">장비 해제</button>
              )}
            </div>
          </div>
          {/* 이미지 영역 */}
          <div className="slotBody slotBodyArmor">
            {!has && <div className="slotEmpty">미선택</div>}
            {has && (
              <div className="slotPreview">
                {warnBackpack && <div className="stratWarnDot" />}
                <div className="slotImageWrap">
                  <SlotImg className="slotImage slotImageArmor" src={picked.icon} alt={picked.name_ko||picked.id} sheet={picked.sheet} />
                </div>
                {/* 하단: 패시브 + 이름 */}
                <div className="slotText slotTextArmor">
                  {passiveTag && <div className="slotPassive">{passiveTag}</div>}
                  <div className="slotName slotNameArmor">{picked.name_ko || "이름 없음"}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 주무기 ── */}
      {isPrimary && (
        <>
          <div className="slotTop">
            <div className="slotTitle">{def.titleKo}</div>
            {has && (
              <button className="slotClearText" onClick={e=>{e.stopPropagation();onClear();}} type="button">장비 해제</button>
            )}
          </div>
          <div className="slotBody slotBodyPrimary">
            {!has && <div className="slotEmpty">미선택</div>}
            {has && (
              <div className="slotPreview">
                {warnBackpack && <div className="stratWarnDot" />}
                <div className="slotImageWrap">
                  <SlotImg className="slotImage slotImagePrimary" src={picked.icon} alt={picked.name_ko||picked.id} sheet={picked.sheet} />
                </div>
              </div>
            )}
          </div>
          {/* 하단 메타: pill행 + 이름 + desc (5번: 행간 gap 조정) */}
          {has && (
            <div className="slotPrimaryBottom">
              {(weaponType || traits.length>0) && (
                <div className="slotPrimaryPills">
                  {weaponType && (
                    <span
                      className="slotPill slotPillPen"
                      style={{ background:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.85)", borderColor:"rgba(255,255,255,0.22)" }}
                    >
                      {weaponType}
                    </span>
                  )}
                  {traits.map(t => {
                    const ts = getTraitStyle(t);
                    return (
                      <span
                        key={t}
                        className="slotPill slotPillTrait"
                        title={TAG_TOOLTIP[t] || t}
                        style={{ background: ts.bg, color: ts.color, borderColor: ts.bg }}
                      >
                        {t}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="slotNamePrimary">{picked.name_ko || "이름 없음"}</div>
              {picked.desc && <div className="slotDescPrimary">{picked.desc}</div>}
            </div>
          )}
        </>
      )}

      {/* ── 보조/투척 등 ── */}
      {!isStratagem && !isArmor && !isPrimary && (
        <>
          <div className="slotTop">
            <div className="slotTitle">{def.titleKo}</div>
            {has && (
              <button className="slotClearText" onClick={e=>{e.stopPropagation();onClear();}} type="button">장비 해제</button>
            )}
          </div>
          <div className="slotBody">
            {!has && <div className="slotEmpty">미선택</div>}
            {has && (
              <div className="slotPreview">
                {warnBackpack && <div className="stratWarnDot" />}
                {armorTag && <div className="slotBadge">{armorTag}</div>}
                <div className="slotImageWrap">
                  <SlotImg className="slotImage" src={picked.icon} alt={picked.name_ko||picked.id} sheet={picked.sheet} />
                </div>
                {!hideName && (
                  <div className="slotText">
                    {passiveTag && <div className="slotPassive">{passiveTag}</div>}
                    <div className="slotName">{picked.name_ko || "이름 없음"}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 스트라타젬 ── */}
      {isStratagem && (
        <div className="slotBody">
          {!has && <div className="slotEmpty">{isPickerActive ? "선택 중..." : ""}</div>}
          {has && (
            <div className="slotPreview">
              {warnBackpack && <div className="stratWarnDot" />}
              <div className="slotImageWrap">
                <SlotImg className="slotImage slotImageStratagem" src={picked.icon} alt={picked.name_ko||picked.id} sheet={picked.sheet} />
              </div>
            </div>
          )}
          {has && (
            <div className="slotStratBtnWrap">
              <button className="slotClearBtn" onClick={e=>{e.stopPropagation();onClear();}} type="button">해제</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
