/**
 * 발신 아이덴티티 폼 검증 — 화면과 테스트가 공유하는 순수 규칙.
 *
 * 서버(`profiles.updateProfile`)에는 필드별 검증이 없다. 그래서 잘못된 값이 조용히 저장되고,
 * 폼은 성공으로 표시한다. 서버 검증을 추가하는 것은 별 작업이므로 여기서는 **제출 전 판정**만
 * 맡는다. 규칙을 화면에 인라인으로 쓰지 않고 분리하는 이유는 테스트 가능하게 하려는 것이다.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COMPANY_NAME_MAX = 50;
/** 회사 소개 최소 길이 — "한 줄"의 최소치. 공백만 채운 값을 통과시키지 않는다. */
export const BOILERPLATE_MIN = 10;
export const BOILERPLATE_MAX = 300;

export interface ProfileFormValues {
  companyName: string;
  senderName: string;
  contactEmail: string;
  boilerplate: string;
}

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

/**
 * 폼 오류 판정.
 *
 * `boilerplate`는 **비어 있으면 통과시킨다** — 선택 항목이다. 값이 있을 때만 길이를 본다.
 * (필수로 만들면 보도자료 하단 소개를 쓰지 않는 사용자가 저장을 못 한다.)
 */
export function validateProfileForm(values: ProfileFormValues): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  const companyName = values.companyName.trim();
  if (companyName.length === 0) {
    errors.companyName = "회사명을 입력해 주세요.";
  } else if (companyName.length > COMPANY_NAME_MAX) {
    errors.companyName = `회사명은 ${COMPANY_NAME_MAX}자 이내로 입력해 주세요.`;
  }

  const contactEmail = values.contactEmail.trim();
  if (contactEmail.length === 0) {
    errors.contactEmail = "회신용 이메일을 입력해 주세요.";
  } else if (!EMAIL_PATTERN.test(contactEmail)) {
    errors.contactEmail = "올바른 이메일 주소가 아닙니다.";
  }

  const boilerplate = values.boilerplate.trim();
  if (boilerplate.length > 0) {
    if (boilerplate.length < BOILERPLATE_MIN) {
      errors.boilerplate = `회사 소개를 ${BOILERPLATE_MIN}자 이상 적어 주세요.`;
    } else if (boilerplate.length > BOILERPLATE_MAX) {
      errors.boilerplate = `회사 소개는 ${BOILERPLATE_MAX}자 이내로 적어 주세요.`;
    }
  }

  return errors;
}

export function hasProfileFormErrors(errors: ProfileFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
