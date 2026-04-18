import { useCallback, useEffect, useRef, useState } from "react";

/* ── localStorage ── */
const LS_KEY = "helldiver_radar_v1";
function lsGet() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function lsSet(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} }

/* ── 유틸 ── */
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* ── 기본 항목 ── */
const DEFAULT_AXES = [
  { id: uid(), label: "대전차 화력", value: 50 },
  { id: uid(), label: "대보병 화력", value: 50 },
  { id: uid(), label: "생존력",      value: 50 },
  { id: uid(), label: "기동성",      value: 50 },
  { id: uid(), label: "지원 능력",   value: 50 },
];

/* ── 색상 팔레트 ── */
const CHART_COLORS = [
  { stroke:"rgba(253,224,71,.90)",  fill:"rgba(253,224,71,.18)",  dot:"#fde047" },
  { stroke:"rgba(96,165,250,.90)",  fill:"rgba(96,165,250,.18)",  dot:"#60a5fa" },
  { stroke:"rgba(74,222,128,.90)",  fill:"rgba(74,222,128,.18)",  dot:"#4ade80" },
  { stroke:"rgba(248,113,113,.90)", fill:"rgba(248,113,113,.18)", dot:"#f87171" },
  { stroke:"rgba(167,139,250,.90)", fill:"rgba(167,139,250,.18)", dot:"#a78bfa" },
];

/* ═══════════════════════════════════
   SVG 레이더 차트 컴포넌트
═══════════════════════════════════ */
function RadarSvg({ axes, minVal, maxVal, size = 320, overlayCharts = [], activeColor }) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.34;
  const labelR = R + size * 0.13;
  const n = axes.length;
  if (n < 3) return null;

  function angle(i) { return (Math.PI * 2 * i) / n - Math.PI / 2; }
  function pt(val, i) {
    const ratio = clamp((val - minVal) / (maxVal - minVal || 1), 0, 1);
    const a = angle(i);
    return [cx + ratio * R * Math.cos(a), cy + ratio * R * Math.sin(a)];
  }
  function gridPt(i, frac) {
    const a = angle(i);
    return [cx + frac * R * Math.cos(a), cy + frac * R * Math.sin(a)];
  }
  function polyStr(vals) {
    return axes.map((ax, i) => pt(ax.value ?? minVal, i).join(",")).join(" ");
  }
  function overlayPolyStr(vals) {
    return vals.map((v, i) => pt(v, i).join(",")).join(" ");
  }

  // 격자 단계 (5단계)
  const gridSteps = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible", display: "block" }}>
      <defs>
        <filter id="rGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* 격자 */}
      {gridSteps.map(frac => {
        const pts = axes.map((_, i) => gridPt(i, frac).join(",")).join(" ");
        const gridVal = Math.round(minVal + frac * (maxVal - minVal));
        const [lx, ly] = gridPt(0, frac);
        return (
          <g key={frac}>
            <polygon points={pts} fill="none"
              stroke={frac === 1 ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.10)"}
              strokeWidth={frac === 1 ? 1.2 : 0.7}/>
            <text x={lx + 4} y={ly - 2} fontSize="9" fill="rgba(255,255,255,.28)"
              fontFamily="'Noto Sans KR','Inter',sans-serif">{gridVal}</text>
          </g>
        );
      })}

      {/* 축 선 */}
      {axes.map((_, i) => {
        const [x, y] = gridPt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.15)" strokeWidth="1"/>;
      })}

      {/* 오버레이 (저장된 그래프 — 희미하게) */}
      {overlayCharts.map((chart, ci) => {
        const col = CHART_COLORS[(ci + 1) % CHART_COLORS.length];
        // 오버레이는 현재 axes 순서 기준으로 값을 매핑
        const vals = axes.map(ax => {
          const found = chart.axes.find(a => a.label === ax.label);
          return found ? clamp(found.value, chart.minVal ?? minVal, chart.maxVal ?? maxVal) : minVal;
        });
        return (
          <polygon key={chart.id} points={overlayPolyStr(vals)}
            fill={col.fill} stroke={col.stroke}
            strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round"
            opacity="0.45"/>
        );
      })}

      {/* 현재 차트 */}
      <polygon points={polyStr()}
        fill={activeColor.fill} stroke={activeColor.stroke}
        strokeWidth="2.5" strokeLinejoin="round"
        filter="url(#rGlow)"/>

      {/* 꼭짓점 */}
      {axes.map((ax, i) => {
        const [x, y] = pt(ax.value ?? minVal, i);
        return (
          <circle key={i} cx={x} cy={y} r="4.5"
            fill={activeColor.dot}
            style={{ filter: `drop-shadow(0 0 5px ${activeColor.stroke})` }}/>
        );
      })}

      {/* 축 레이블 + 수치 */}
      {axes.map((ax, i) => {
        const a = angle(i);
        const [lx, ly] = [cx + labelR * Math.cos(a), cy + labelR * Math.sin(a)];
        const textAnchor = lx < cx - 8 ? "end" : lx > cx + 8 ? "start" : "middle";
        return (
          <g key={ax.id}>
            <text x={lx} y={ly} textAnchor={textAnchor}
              fill="rgba(255,255,255,.88)" fontSize="12" fontWeight="700"
              fontFamily="'Noto Sans KR','Inter',sans-serif"
              dominantBaseline="middle">
              {ax.label}
            </text>
            <text x={lx} y={ly + 14} textAnchor={textAnchor}
              fill={activeColor.dot} fontSize="11" fontWeight="800"
              fontFamily="'Noto Sans KR','Inter',sans-serif">
              {ax.value ?? minVal}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════
   메인 RadarPage
═══════════════════════════════════ */
export default function RadarPage() {
  /* ── 현재 편집 중인 차트 상태 ── */
  const [chartTitle, setChartTitle] = useState("새 로드아웃");
  const [axes, setAxes] = useState(DEFAULT_AXES.map(a => ({ ...a, id: uid() })));
  const [minVal, setMinVal] = useState(0);
  const [maxVal, setMaxVal] = useState(100);
  const [colorIdx, setColorIdx] = useState(0);

  /* ── 저장된 차트 목록 ── */
  const [savedCharts, setSavedCharts] = useState(() => lsGet()?.charts ?? []);
  const [overlayIds, setOverlayIds] = useState(new Set()); // 비교 오버레이 표시할 id들

  /* ── UI 상태 ── */
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saveModal, setSaveModal] = useState(false);
  const [editingChartId, setEditingChartId] = useState(null); // 이름 편집 중
  const [editingName, setEditingName] = useState("");
  const [loadConfirm, setLoadConfirm] = useState(null); // 불러오기 확인

  const svgWrapRef = useRef(null);
  const activeColor = CHART_COLORS[colorIdx % CHART_COLORS.length];

  /* ── 저장 ── */
  function persistCharts(list) {
    setSavedCharts(list);
    lsSet({ charts: list });
  }

  /* ── 축 조작 ── */
  function addAxis() {
    if (axes.length >= 12) return;
    setAxes(prev => [...prev, { id: uid(), label: `항목 ${prev.length + 1}`, value: Math.round((minVal + maxVal) / 2) }]);
  }
  function removeAxis(id) {
    if (axes.length <= 3) return;
    setAxes(prev => prev.filter(a => a.id !== id));
  }
  function updateAxisLabel(id, label) {
    setAxes(prev => prev.map(a => a.id === id ? { ...a, label } : a));
  }
  function updateAxisValue(id, raw) {
    const v = clamp(Number(raw) || minVal, minVal, maxVal);
    setAxes(prev => prev.map(a => a.id === id ? { ...a, value: v } : a));
  }
  function moveAxis(id, dir) {
    setAxes(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  /* ── 범위 변경 시 값 clamp ── */
  function handleMinChange(v) {
    const n = Number(v);
    setMinVal(n);
    setAxes(prev => prev.map(a => ({ ...a, value: clamp(a.value, n, maxVal) })));
  }
  function handleMaxChange(v) {
    const n = Number(v);
    setMaxVal(n);
    setAxes(prev => prev.map(a => ({ ...a, value: clamp(a.value, minVal, n) })));
  }

  /* ── 저장 ── */
  function saveChart() {
    const entry = {
      id: uid(),
      title: chartTitle.trim() || "로드아웃",
      axes: axes.map(a => ({ ...a })),
      minVal, maxVal, colorIdx,
      createdAt: new Date().toISOString(),
    };
    const next = [...savedCharts, entry];
    persistCharts(next);
    setSaveModal(false);
  }

  /* ── 불러오기 ── */
  function loadChart(chart) {
    setChartTitle(chart.title);
    setAxes(chart.axes.map(a => ({ ...a })));
    setMinVal(chart.minVal ?? 0);
    setMaxVal(chart.maxVal ?? 100);
    setColorIdx(chart.colorIdx ?? 0);
    setManageOpen(false);
    setLoadConfirm(null);
  }

  /* ── 삭제 ── */
  function deleteChart(id) {
    const next = savedCharts.filter(c => c.id !== id);
    persistCharts(next);
    setOverlayIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    setDeleteConfirm(null);
  }

  /* ── 오버레이 토글 ── */
  function toggleOverlay(id) {
    setOverlayIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  /* ── 이름 편집 ── */
  function commitEdit(id) {
    const t = editingName.trim();
    if (!t) { setEditingChartId(null); return; }
    persistCharts(savedCharts.map(c => c.id === id ? { ...c, title: t } : c));
    setEditingChartId(null);
  }

  /* ── PNG 내보내기 ── */
  function exportPng() {
    const svg = svgWrapRef.current?.querySelector("svg");
    if (!svg) return;
    const SVG_SIZE = 360;
    const PAD = 48, TOP = 52, BOTTOM = 20;
    const W = SVG_SIZE + PAD * 2;
    const H = SVG_SIZE + TOP + BOTTOM + PAD;
    const canvas = document.createElement("canvas");
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    // 배경
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
    // 제목
    ctx.fillStyle = "#f0c400";
    ctx.font = "bold 16px 'Noto Sans KR',system-ui,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(chartTitle || "로드아웃 전력 분석", W / 2, 14);
    // 범위 표시
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = "11px 'Noto Sans KR',system-ui,sans-serif";
    ctx.fillText(`범위: ${minVal} ~ ${maxVal}`, W / 2, 34);
    // SVG 렌더
    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, PAD, TOP, SVG_SIZE, SVG_SIZE);
      // 워터마크
      ctx.fillStyle = "rgba(240,196,0,.45)";
      ctx.font = "bold 10px 'Noto Sans KR',system-ui,sans-serif";
      ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("SES 자기 결정의 전달자", W - 10, H - 6);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `radar_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  }

  /* ── 오버레이 차트 목록 ── */
  const overlaySaved = savedCharts.filter(c => overlayIds.has(c.id));

  return (
    <div className="pageRadar">
      <div className="radarLayout">

        {/* ══ 좌측: 차트 + 저장 목록 미리보기 ══ */}
        <div className="radarLeft">

          {/* 차트 영역 */}
          <div className="radarChartCard">
            {/* 상단: 제목 편집 + 색상 선택 */}
            <div className="radarChartHeader">
              <input
                className="radarTitleInput"
                value={chartTitle}
                onChange={e => setChartTitle(e.target.value)}
                placeholder="차트 제목 입력"
                maxLength={30}
              />
              <div className="radarColorPicker">
                {CHART_COLORS.map((c, i) => (
                  <button key={i} type="button"
                    className={`radarColorDot ${i === colorIdx ? "active" : ""}`}
                    style={{ background: c.dot, boxShadow: i === colorIdx ? `0 0 8px ${c.dot}` : "none" }}
                    onClick={() => setColorIdx(i)}
                  />
                ))}
              </div>
            </div>

            {/* SVG 차트 */}
            <div className="radarSvgWrap" ref={svgWrapRef}>
              <RadarSvg
                axes={axes}
                minVal={minVal}
                maxVal={maxVal}
                size={340}
                overlayCharts={overlaySaved}
                activeColor={activeColor}
              />
            </div>

            {/* 오버레이 범례 */}
            {overlaySaved.length > 0 && (
              <div className="radarOverlayLegend">
                <span className="radarLegendItem">
                  <span className="radarLegendDot" style={{ background: activeColor.dot }}/>
                  {chartTitle || "현재"}
                </span>
                {overlaySaved.map((c, i) => {
                  const col = CHART_COLORS[(i + 1) % CHART_COLORS.length];
                  return (
                    <span key={c.id} className="radarLegendItem">
                      <span className="radarLegendDot" style={{ background: col.dot, opacity: 0.6 }}/>
                      <span style={{ opacity: 0.6 }}>{c.title}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="radarChartActions">
              <button type="button" className="lBtn lBtnSave" onClick={() => setSaveModal(true)}>
                현재 차트 저장
              </button>
              <button type="button" className="lBtn lBtnManage" onClick={() => setManageOpen(true)}>
                저장 목록 관리
              </button>
              <button type="button" className="lBtn lBtnExport" onClick={exportPng}>
                이미지 내보내기
              </button>
            </div>
          </div>

          {/* 저장된 차트 미리보기 */}
          {savedCharts.length > 0 && (
            <div className="radarPreviewSection">
              <div className="radarPreviewTitle">저장된 차트</div>
              <div className="radarPreviewGrid">
                {savedCharts.map((chart, ci) => {
                  const col = CHART_COLORS[chart.colorIdx ?? 0];
                  const isOverlay = overlayIds.has(chart.id);
                  return (
                    <div key={chart.id} className={`radarPreviewCard ${isOverlay ? "overlayActive" : ""}`}>
                      {/* 미니 SVG */}
                      <div className="radarMiniSvg">
                        <RadarSvg
                          axes={chart.axes}
                          minVal={chart.minVal ?? 0}
                          maxVal={chart.maxVal ?? 100}
                          size={120}
                          overlayCharts={[]}
                          activeColor={col}
                        />
                      </div>
                      <div className="radarPreviewInfo">
                        <div className="radarPreviewName">{chart.title}</div>
                        <div className="radarPreviewDate">{new Date(chart.createdAt).toLocaleDateString("ko-KR")}</div>
                        <div className="radarPreviewBtns">
                          <button type="button" className="radarMiniBtn" onClick={() => setLoadConfirm(chart)}>불러오기</button>
                          <button type="button"
                            className={`radarMiniBtn ${isOverlay ? "overlayOn" : ""}`}
                            onClick={() => toggleOverlay(chart.id)}>
                            {isOverlay ? "비교 해제" : "비교"}
                          </button>
                          <button type="button" className="radarMiniBtn danger" onClick={() => setDeleteConfirm(chart.id)}>삭제</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ══ 우측: 항목 편집 패널 ══ */}
        <div className="radarEditPanel">
          {/* 범위 설정 */}
          <div className="radarSection">
            <div className="radarSectionTitle">수치 범위</div>
            <div className="radarRangeRow">
              <label className="radarRangeLabel">최솟값</label>
              <input type="number" className="radarRangeInput"
                value={minVal} min={-999} max={maxVal - 1}
                onChange={e => handleMinChange(e.target.value)}/>
              <label className="radarRangeLabel">최댓값</label>
              <input type="number" className="radarRangeInput"
                value={maxVal} min={minVal + 1} max={9999}
                onChange={e => handleMaxChange(e.target.value)}/>
            </div>
          </div>

          {/* 항목 편집 */}
          <div className="radarSection">
            <div className="radarSectionTitleRow">
              <div className="radarSectionTitle">평가 항목 ({axes.length}개)</div>
              <button type="button" className="radarAddBtn"
                onClick={addAxis} disabled={axes.length >= 12}>
                + 항목 추가
              </button>
            </div>
            <div className="radarAxesList">
              {axes.map((ax, i) => (
                <div key={ax.id} className="radarAxisRow">
                  {/* 순서 이동 */}
                  <div className="radarAxisOrder">
                    <button type="button" className="radarOrderBtn" onClick={() => moveAxis(ax.id, -1)} disabled={i === 0}>▲</button>
                    <button type="button" className="radarOrderBtn" onClick={() => moveAxis(ax.id, 1)} disabled={i === axes.length - 1}>▼</button>
                  </div>
                  {/* 라벨 */}
                  <input
                    className="radarAxisLabel"
                    value={ax.label}
                    onChange={e => updateAxisLabel(ax.id, e.target.value)}
                    placeholder="항목명"
                    maxLength={12}
                  />
                  {/* 슬라이더 */}
                  <input type="range"
                    className="radarAxisSlider"
                    min={minVal} max={maxVal} step={1}
                    value={ax.value ?? minVal}
                    onChange={e => updateAxisValue(ax.id, e.target.value)}
                  />
                  {/* 수치 직접 입력 */}
                  <input type="number"
                    className="radarAxisNum"
                    value={ax.value ?? minVal}
                    min={minVal} max={maxVal}
                    onChange={e => updateAxisValue(ax.id, e.target.value)}
                  />
                  {/* 삭제 */}
                  <button type="button" className="radarAxisDel"
                    onClick={() => removeAxis(ax.id)}
                    disabled={axes.length <= 3}
                    title={axes.length <= 3 ? "최소 3개 항목 필요" : "항목 삭제"}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="radarAxisHint">항목은 최소 3개, 최대 12개까지 추가할 수 있습니다.</div>
          </div>
        </div>
      </div>

      {/* ══ 저장 확인 모달 ══ */}
      {saveModal && (
        <div className="modalOverlay" onClick={() => setSaveModal(false)}>
          <div className="saveModalCard" onClick={e => e.stopPropagation()}>
            <div className="saveModalTitle">차트 저장</div>
            <input className="saveModalInput" type="text"
              placeholder="차트 이름 입력"
              value={chartTitle}
              onChange={e => setChartTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveChart(); if (e.key === "Escape") setSaveModal(false); }}
              autoFocus
            />
            <div className="saveModalActions">
              <button className="lBtn lBtnSave" type="button" onClick={saveChart}>저장</button>
              <button className="lBtn lBtnManage" type="button" onClick={() => setSaveModal(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 불러오기 확인 모달 ══ */}
      {loadConfirm && (
        <div className="modalOverlay" onClick={() => setLoadConfirm(null)}>
          <div className="saveModalCard" style={{ gap: 18 }} onClick={e => e.stopPropagation()}>
            <div className="saveModalTitle">차트 불러오기</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.70)", lineHeight: 1.7 }}>
              <strong style={{ color: "#fff" }}>{loadConfirm.title}</strong>을 불러오면<br/>
              현재 편집 중인 내용이 초기화됩니다.<br/>계속하시겠습니까?
            </div>
            <div className="saveModalActions">
              <button className="lBtn lBtnSave" type="button" onClick={() => loadChart(loadConfirm)}>불러오기</button>
              <button className="lBtn lBtnManage" type="button" onClick={() => setLoadConfirm(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 삭제 확인 모달 ══ */}
      {deleteConfirm && (
        <div className="modalOverlay" onClick={() => setDeleteConfirm(null)}>
          <div className="confirmCard" onClick={e => e.stopPropagation()}>
            <div className="confirmTitle">차트 삭제</div>
            <div className="confirmDesc">
              <strong>{savedCharts.find(c => c.id === deleteConfirm)?.title}</strong> 차트를 삭제하시겠습니까?<br/>
              이 작업은 되돌릴 수 없습니다.
            </div>
            <div className="confirmActions">
              <button className="lBtn lBtnDanger" type="button" onClick={() => deleteChart(deleteConfirm)}>삭제</button>
              <button className="lBtn lBtnManage" type="button" onClick={() => setDeleteConfirm(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 저장 목록 관리 모달 ══ */}
      {manageOpen && (
        <div className="modalOverlay" onClick={() => setManageOpen(false)}>
          <div className="manageModalCard" onClick={e => e.stopPropagation()}>
            <div className="manageModalHeader">
              <div className="manageModalTitle">저장된 차트 관리</div>
              <button className="modalClose" type="button" onClick={() => setManageOpen(false)}>닫기</button>
            </div>
            <div className="manageModalList">
              {savedCharts.length === 0 && (
                <div className="manageEmpty">저장된 차트가 없습니다.</div>
              )}
              {savedCharts.map(chart => {
                const isEditing = editingChartId === chart.id;
                const isOverlay = overlayIds.has(chart.id);
                const col = CHART_COLORS[chart.colorIdx ?? 0];
                return (
                  <div key={chart.id} className="manageItem">
                    <div className="manageItemInfo">
                      {isEditing ? (
                        <div className="manageEditRow">
                          <input className="manageEditInput" value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(chart.id); if (e.key === "Escape") setEditingChartId(null); }}
                            autoFocus/>
                          <button className="manageBtnConfirm" type="button" onClick={() => commitEdit(chart.id)}>확인</button>
                          <button className="manageBtnCancel" type="button" onClick={() => setEditingChartId(null)}>취소</button>
                        </div>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span className="radarManageDot" style={{ background: col.dot }}/>
                          <span className="manageItemName">{chart.title}</span>
                          <button className="manageBtnEdit" type="button"
                            onClick={() => { setEditingChartId(chart.id); setEditingName(chart.title); }}>✎</button>
                        </div>
                      )}
                      {!isEditing && <div className="manageItemDate">{new Date(chart.createdAt).toLocaleDateString("ko-KR")} · 항목 {chart.axes.length}개</div>}
                    </div>
                    {!isEditing && (
                      <div className="manageItemActions">
                        <button className="manageBtnLoad" type="button" onClick={() => { setLoadConfirm(chart); setManageOpen(false); }}>불러오기</button>
                        <button className={`manageBtnLoad ${isOverlay ? "" : ""}`} type="button"
                          style={isOverlay ? { borderColor:"rgba(96,165,250,.7)", color:"#60a5fa" } : {}}
                          onClick={() => toggleOverlay(chart.id)}>
                          {isOverlay ? "비교 중" : "비교"}
                        </button>
                        <button className="manageBtnDel" type="button" onClick={() => setDeleteConfirm(chart.id)}>삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
