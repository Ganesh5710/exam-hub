import React from 'react';
import { useThemeStore } from '../store/themeStore';
import { Sun, Moon, Settings as SettingsIcon } from 'lucide-react';

function Settings() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your application preferences
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
            <SettingsIcon className="h-5 w-5 mr-2" />
            Appearance
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Theme
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center p-4 rounded-lg border-2 transition-colors ${
                    theme === 'light'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800'
                  }`}
                >
                  <Sun className={`h-5 w-5 mr-2 ${
                    theme === 'light' ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    theme === 'light'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-gray-300'
                  }`}>
                    Light Mode
                  </span>
                </button>

                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center p-4 rounded-lg border-2 transition-colors ${
                    theme === 'dark'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800'
                  }`}
                >
                  <Moon className={`h-5 w-5 mr-2 ${
                    theme === 'dark' ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    theme === 'dark'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-gray-300'
                  }`}>
                    Dark Mode
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;