import { z } from 'zod'

export const notificationCategories=['lowStock','outOfStock','purchaseApproval','transferApproval','transferReceived','purchaseReceived','warrantyExpiring','maintenanceDue','warrantyClaimUpdate']
export const dashboardCards=['products','units','value','low','out','suppliers']
export const dashboardCharts=['movement','category','lowStock','activity']
const unique = values => new Set(values).size===values.length
export const notificationsSchema=z.object(Object.fromEntries(notificationCategories.map(key=>[key,z.boolean()]))).strict()
export const dashboardSchema=z.object({cards:z.array(z.enum(dashboardCards)).max(6).refine(unique,'Duplicate cards.'),charts:z.array(z.enum(dashboardCharts)).max(4).refine(unique,'Duplicate charts.'),defaultWarehouseId:z.string().min(1).max(191).nullable(),defaultPeriod:z.enum(['7d','30d','3m','6m','1y'])}).strict()
export const preferencesSchema=z.object({expectedRevision:z.number().int().min(0),notifications:notificationsSchema,dashboard:dashboardSchema}).strict()
export const defaultNotifications=()=>Object.fromEntries(notificationCategories.map(key=>[key,true]))
export const defaultDashboard=()=>({cards:[...dashboardCards],charts:[...dashboardCharts],defaultWarehouseId:null,defaultPeriod:'30d'})
