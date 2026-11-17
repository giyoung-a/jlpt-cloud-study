# JLPT 무료 클라우드 배포

이 폴더의 앱은 Render의 무료 Docker 웹 서비스와 Neon의 무료 PostgreSQL을 사용합니다. 배포한 뒤에는 HTTPS 주소에서 일본어 청해를 재생하고 방문자별 모의고사 기록을 보존합니다. PC의 Windows 음성과 임시 터널은 필요하지 않습니다.

## 최초 배포

1. [Neon 콘솔](https://console.neon.tech/)에서 Free 프로젝트를 만든 뒤 **Connect**의 PostgreSQL 연결 문자열을 복사합니다. TLS 설정(`sslmode=require`)을 유지합니다.
2. ZIP을 풀고 파일을 본인 GitHub 비공개 저장소의 최상위 폴더에 올립니다. `Dockerfile`, `.dockerignore`, `render.yaml`이 포함돼 있어야 합니다.
3. [Render 대시보드](https://dashboard.render.com/)에 로그인한 뒤 **New → Blueprint**를 열고 그 저장소를 연결합니다. `DATABASE_URL`에는 Neon 연결 문자열을 Render의 비밀 환경 변수 입력란에 붙여 넣습니다.
4. 서비스가 배포되면 Render의 HTTPS 주소를 엽니다. **Environment**의 `JLPT_INVITE_CODE`를 확인해 친구들에게 주소와 코드만 전달합니다. `JLPT_SESSION_SECRET`과 `DATABASE_URL`은 배포 시스템 안에 보관합니다.
5. 모의고사에서 **청해 음량 확인**을 재생합니다. 친구별 모의고사 기록은 초대 코드로 들어온 브라우저에 발급된 세션을 기준으로 분리됩니다. 일일 학습 진도는 각 브라우저에 저장됩니다.

Cloudflare 임시 주소와 이 배포 주소는 브라우저 저장 공간이 따로입니다. 기존 주소에서 만든 기록은 이 패키지에 포함되지 않습니다. Render 무료 서버의 첫 접속은 절전 상태에서 깨어나는 시간이 걸릴 수 있습니다. 각 서비스의 무료 사용량은 해당 콘솔에서 확인할 수 있습니다.

- [Render Blueprint 설정](https://render.com/docs/blueprint-spec)
- [Render 무료 요금제](https://render.com/docs/free)
- [Neon 무료 요금제](https://neon.com/pricing)
- [Debian Open JTalk 일본어 음성](https://packages.debian.org/bookworm/hts-voice-nitech-jp-atr503-m001)

