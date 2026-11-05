import type {Metadata} from 'next';
export const metadata:Metadata={title:'最后防线 · 深圳双人合作',description:'南山—宝安真实地图上的双人合作生存游戏'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
