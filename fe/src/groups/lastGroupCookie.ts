// 그룹 탭 진입 시 서버에서 마지막 방문 그룹으로 리다이렉트하기 위해 쿠키 이름과 유효 기간을 공유합니다.

export const LAST_GROUP_COOKIE = "psstudio_last_group";
/** 약 400일 (초 단위) */
export const LAST_GROUP_MAX_AGE_SEC = 60 * 60 * 24 * 400;
