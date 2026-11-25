// assetVersion.js
// public 폴더 이미지(아이콘 등) 캐시 버전 관리
//
// vercel.json에서 /icons/* 에 1년 캐시를 걸었기 때문에,
// 아이콘을 "같은 파일명으로 교체"했을 때 사용자 브라우저가 옛 이미지를 계속 쓸 수 있습니다.
// → 아이콘을 교체/수정한 경우에만 ASSET_VERSION 값을 올려서 배포하세요. (새 파일 추가만 했다면 안 올려도 됨)
export const ASSET_VERSION = "26.11.26";

// 같은 사이트의 이미지 경로에 ?v=ASSET_VERSION 을 붙입니다.
// 외부 URL, data:, blob:, 이미 v= 가 붙은 경로는 그대로 둡니다.
export function withAssetVersion(url) {
  if (!url) return url;
  const str = String(url);
  if (/^(data:|blob:)/i.test(str)) return str;
  if (/^https?:\/\//i.test(str)) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!origin || !str.startsWith(origin)) return str;
  }
  if (/[?&]v=/.test(str)) return str;
  return `${str}${str.includes("?") ? "&" : "?"}v=${ASSET_VERSION}`;
}
