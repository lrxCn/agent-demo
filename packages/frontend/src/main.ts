import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installStores } from './stores'
import './style.css'
import './styles/theme.css'

const app = createApp(App)
installStores(app)
app.use(router)
app.mount('#app')
