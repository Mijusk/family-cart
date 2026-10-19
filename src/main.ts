import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
// Served with the app instead of from Google Fonts: no extra servers to reach before the first paint.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/public-sans'
import './styles/base.css'
import { registerServiceWorker } from './lib/push'

createApp(App).use(createPinia()).use(router).mount('#app')
registerServiceWorker()
