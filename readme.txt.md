# 繁簡轉換器(網頁版)使用方法：  
把Browser目錄下的三個檔案下載到自己電腦裡，用瀏覽器打開"GBK_BIG5_UI.html"即可  
- full.js  
- iconv-browser.js  
- GBK_BIG5_UI.html  


## 以下只是說明檔案來源，可以跳過  
full.js：  
從專案 OpenCC 下載  
https://github.com/nk2028/opencc-js/tree/main/src  

iconv-browser.js：  
專案 iconv-lite 網址  
https://github.com/pillarjs/iconv-lite/tree/master  
無法直接在網頁上連結使用，因為它是 Node.js 套件。  
用 bundler 把它打包成單一 JS，才能給瀏覽器用。  
要用node.js，可從 https://nodejs.org 安裝 LTS 版  
在自己硬碟裡建一個資料夾，例如 iconv-browser  
進入 iconv-browser 資料夾中  
執行 npm init -y （建立檔案package.json）  
執行 npm install iconv-lite browserify （安裝套件）  
會有些npm的報錯訊息，但通常都沒影響，可以忽略。  
只要看到 added 180 packages 這行就代表成功了。  
用編輯器例如notepad，自己新建一個文件，內容只需要以下兩行：  
const iconv = require("iconv-lite")  
window.iconv = iconv  
然後儲存新檔，檔名main.js  
回到目錄下，執行 npx browserify main.js -o iconv-browser.js  
這樣就會打包成瀏覽器版本，也就是現在使用的檔案 iconv-browser.js  

繁簡轉換器.html：  
本人製作於2026.3.12  

GBK_BIG5_UI_20260314.html：  
本人美化介面，更新於2026.3.14  
  
GBK_BIG5_UI.html：  
新增繁體版本的選擇，更新於2026.3.26 - v3.0  
強化介面操作體驗，最後更新2026.4.8  - v3.1.2  

繁簡轉換器_介面美化_合併單檔.html：  
把full.js和iconv-browser.js的內容全部塞進GBK_BIG5_UI_20260314.html檔案裡而已  
跟"GBK_BIG5_UI.html"沒有任何不同的功能，唯一好處是單一檔案就能使用。  

## 可直接使用的線上網頁  
neocities.org 是免費網站，目前是穩定的，但不保證存活時間  
https://artting.neocities.org//tools//GBK_BIG5_UI  

## SillyTavern 目錄是給酒館用的  
OpenCC.js：腳本線上連結的檔案。  
OpenCCv2.2.json：酒館助手用的腳本
