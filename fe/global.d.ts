// CSS와 CSS Module import 타입을 선언합니다.
declare module "*.css";

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
