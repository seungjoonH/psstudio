# GCP 인프라

## 규칙
- 서비스 계정은 최소 권한 원칙으로 설정한다.
- 프로젝트/네트워크 경계는 환경별로 명확히 분리한다.
- Terraform 등 IaC로 인프라를 관리한다.

## Do
- Cloud Logging/Cloud Monitoring + 알람 정책을 구성한다.

## Don't
- 런타임 서비스에 광범위한 편집 권한을 공유하지 않는다.

## 예시
```hcl
resource "google_project_iam_member" "run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.app.email}"
}
```

## 경계
- IaC 계층이 프로비저닝 및 IAM을 소유한다.
- 런타임 서비스는 허용된 리소스/아이덴티티만 사용한다.

## 테스트 범위
- 서비스 계정 권한 검증.
- 모니터링 알람 트리거 검증.
