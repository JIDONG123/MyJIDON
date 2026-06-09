import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/theme.css'
import './styles/layout-shell.css'
import './styles/global-ui.css'
import './styles/teacher-workplace.css'
import App from './App.vue'
import router from './router'
import installCopyGuard from './plugins/copyGuard'

installCopyGuard()

const app = createApp(App)

app.use(createPinia())
app.use(ElementPlus)
app.use(router)

app.mount('#app')