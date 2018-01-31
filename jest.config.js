module.export = {
    "globals": {
      "ts-jest": {
        "skipBabel": true
      }
    },
    "coverageReporters": [
      "json",
      "lcov",
      "text"
    ],
    "transform": {
      "^.+\\.tsx?$": "ts-jest"
    },
    "collectCoverage": true,
    "mapCoverage": true,
    "testRegex": "/__tests__/.*\\.(ts|tsx)$",
    "testPathIgnorePatterns": [
      "/node_modules/",
      "/lib/"
    ],
    "moduleFileExtensions": [
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "node"
    ]
  }
