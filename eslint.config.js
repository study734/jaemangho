import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.next', 'next-env.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // 모듈 경계 (의존 방향: app -> features / server, 공용 코드·기능·서버는 서로 모른다)
  {
    // 앱 공용 UI(components)는 기능과 서버를 몰라야 한다. 필요한 값은 props로 받는다.
    files: ['src/components/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/features', '**/features/**', '**/server', '**/server/**'], message: '공용 UI는 features나 server를 가져오지 않습니다. 필요한 값은 props로 받으세요.' }],
      }],
    },
  },
  {
    // 화면(app)에서는 기능의 공개 인터페이스(features/<이름>/index.ts)만 사용한다.
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/features/*/*', '**/features/*/**'], message: '기능 내부 파일을 직접 가져오지 말고 features/<이름>/index.ts를 통해 사용하세요.' }],
      }],
    },
  },
  {
    // 기능은 앱 화면·공용 UI·서버·다른 기능에 의존하지 않는다 (기능 안에서는 상대 경로만 사용).
    files: ['src/features/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@/*', '../../*', '../../../*', '**/server/**', '**/app/**', '**/components/Sidebar*', '**/components/Admin*'], message: '기능은 앱 화면, 공용 UI, 서버, 다른 기능을 가져올 수 없습니다.' }],
      }],
    },
  },
  {
    // 서버 코드는 화면과 기능을 몰라야 한다.
    files: ['src/server/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/features/**', '**/components/**', '**/app/**', '@/features/**', '@/components/**', '@/app/**'], message: '서버 코드는 화면이나 기능을 가져올 수 없습니다.' }],
      }],
    },
  },
])
