import { admin } from './admin'
import { applications } from './applications'
import { auth } from './auth'
import { dict } from './dict'
import { files } from './files'
import { me } from './me'
import { notifications } from './notifications'
import { stats } from './stats'
import { tasks } from './tasks'
import { templates } from './templates'

export const api = { auth, me, dict, templates, applications, tasks, files, notifications, stats, admin }
export default api
