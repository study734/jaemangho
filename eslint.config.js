import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // 모듈 경계 (의존 방향: App -> features, 공용 코드와 기능은 서로 모른다)
  {
    // 앱 공용 코드(사이드바, 로그인 게이트, 관리자 대시보드 등)는 기능을 몰라야 한다. 필요한 값은 props로 받는다.
    files: ['src/components/**', 'src/auth.ts', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/features', '**/features/**'], message: '공용 코드는 features를 가져오지 않습니다. 필요한 값은 props로 받으세요.' }],
      }],
    },
  },
  {
    // 기능 바깥에서는 기능의 공개 인터페이스(features/<이름>/index.ts)만 사용한다.
    files: ['src/App.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/features/*/*', '**/features/*/**'], message: '기능 내부 파일을 직접 가져오지 말고 features/<이름>/index.ts를 통해 사용하세요.' }],
      }],
    },
  },
  {
    // 기능은 앱 껍데기와 다른 기능에 의존하지 않는다.
    files: ['src/features/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['../../*', '../../../*', '**/App', '**/App.tsx', '**/auth'], message: '기능은 앱 공용 코드나 다른 기능을 가져올 수 없습니다.' }],
      }],
    },
  },
])
