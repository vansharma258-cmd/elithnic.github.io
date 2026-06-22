[app.html](https://github.com/user-attachments/files/29210088/app.html)
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>ELITHNIC — Agency Operations Platform</title>
<style>
:root{
  --bg:#0b0f1a;
  --bg-elev:#101526;
  --accent:#7c3aed;
  --accent-2:#a78bfa;
  --accent-soft:rgba(124,58,237,0.16);
  --glass:rgba(255,255,255,0.045);
  --glass-border:rgba(255,255,255,0.09);
  --glass-strong:rgba(255,255,255,0.07);
  --text:#eef0f7;
  --text-dim:#9aa3b8;
  --text-faint:#6b7384;
  --green:#22c55e;
  --red:#f87171;
  --amber:#fbbf24;
  --blue:#38bdf8;
  --radius-lg:22px;
  --radius-md:16px;
  --radius-sm:10px;
  --shadow-glass:0 8px 32px rgba(0,0,0,0.45);
  --ease:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  background:var(--bg);
  background-image:
    radial-gradient(circle at 15% -10%, rgba(124,58,237,0.18), transparent 45%),
    radial-gradient(circle at 110% 10%, rgba(56,189,248,0.10), transparent 40%),
    radial-gradient(circle at 50% 100%, rgba(124,58,237,0.08), transparent 50%);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  min-height:100vh;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
.hidden{display:none !important;}
a{color:inherit;text-decoration:none;}
button{font-family:inherit;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:8px;}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.22);}
input,select,textarea{outline:none;}

/* ---------- LOADING SCREEN ---------- */
#loadingScreen{
  position:fixed;inset:0;z-index:9999;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:var(--bg);
  background-image:radial-gradient(circle at 50% 30%, rgba(124,58,237,0.22), transparent 50%);
}
.load-mark{
  width:64px;height:64px;border-radius:20px;
  background:linear-gradient(140deg,#7c3aed,#4c1d95);
  display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:22px;letter-spacing:-0.5px;color:#fff;
  box-shadow:0 0 0 1px rgba(255,255,255,0.08) inset, 0 18px 40px rgba(124,58,237,0.35);
  animation:pulseMark 1.6s ease-in-out infinite;
}
@keyframes pulseMark{0%,100%{transform:scale(1);}50%{transform:scale(1.06);}}
.load-bar{width:160px;height:3px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;}
.load-bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:3px;animation:loadSlide 1.1s ease-in-out infinite;}
@keyframes loadSlide{0%{transform:translateX(-100%);}100%{transform:translateX(250%);}}
.load-text{font-size:13px;color:var(--text-dim);letter-spacing:0.4px;}

/* ---------- GLASS PRIMITIVES ---------- */
.glass{
  background:var(--glass);
  border:1px solid var(--glass-border);
  border-radius:var(--radius-lg);
  backdrop-filter:blur(22px) saturate(140%);
  -webkit-backdrop-filter:blur(22px) saturate(140%);
  box-shadow:var(--shadow-glass);
}
.glass-strong{
  background:var(--glass-strong);
  border:1px solid var(--glass-border);
  border-radius:var(--radius-md);
  backdrop-filter:blur(18px) saturate(150%);
  -webkit-backdrop-filter:blur(18px) saturate(150%);
}

/* ---------- AUTH SCREENS (login / track) ---------- */
.auth-wrap{
  position:fixed;inset:0;z-index:50;
  display:flex;align-items:center;justify-content:center;
  padding:24px;
  overflow-y:auto;
}
.auth-card{
  width:100%;max-width:420px;
  padding:38px 34px 30px;
  animation:floatIn .6s var(--ease);
}
@keyframes floatIn{from{opacity:0;transform:translateY(16px) scale(.98);}to{opacity:1;transform:translateY(0) scale(1);}}
.auth-logo{
  width:52px;height:52px;border-radius:16px;margin:0 auto 18px;
  background:linear-gradient(140deg,#7c3aed,#4c1d95);
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;
  box-shadow:0 0 0 1px rgba(255,255,255,0.1) inset,0 12px 30px rgba(124,58,237,0.35);
}
.auth-title{text-align:center;font-size:22px;font-weight:700;letter-spacing:-0.3px;margin:0 0 4px;}
.auth-sub{text-align:center;font-size:13px;color:var(--text-dim);margin:0 0 26px;}
.field{margin-bottom:16px;}
.field label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:7px;font-weight:600;letter-spacing:0.2px;}
.field input,.field select,.field textarea{
  width:100%;
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:12px;
  padding:11px 14px;
  color:var(--text);
  font-size:14px;
  transition:border-color .2s,background .2s;
}
.field textarea{resize:vertical;min-height:70px;font-family:inherit;}
.field input:focus,.field select:focus,.field textarea:focus{
  border-color:var(--accent);background:rgba(124,58,237,0.08);
}
.field select{appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%239aa3b8'/></svg>");background-repeat:no-repeat;background-position:right 14px center;}
.field-hint{font-size:11.5px;color:var(--text-faint);margin-top:6px;}
.field-err{font-size:11.5px;color:var(--red);margin-top:6px;display:none;}

.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:11px 18px;border-radius:12px;border:1px solid transparent;
  font-size:13.5px;font-weight:600;cursor:pointer;transition:transform .15s,filter .15s,background .2s;
  white-space:nowrap;
}
.btn:active{transform:scale(.97);}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 10px 24px rgba(124,58,237,0.35);}
.btn-primary:hover{filter:brightness(1.08);}
.btn-block{width:100%;}
.btn-ghost{background:rgba(255,255,255,0.05);color:var(--text);border-color:rgba(255,255,255,0.1);}
.btn-ghost:hover{background:rgba(255,255,255,0.09);}
.btn-danger{background:rgba(248,113,113,0.12);color:#fca5a5;border-color:rgba(248,113,113,0.25);}
.btn-danger:hover{background:rgba(248,113,113,0.2);}
.btn-sm{padding:7px 12px;font-size:12.5px;border-radius:9px;}
.btn-icon{width:34px;height:34px;padding:0;border-radius:10px;}
.link-row{text-align:center;margin-top:16px;font-size:12.5px;color:var(--text-dim);}
.link-row a{color:var(--accent-2);font-weight:600;cursor:pointer;}
.auth-foot{text-align:center;margin-top:22px;font-size:11.5px;color:var(--text-faint);}

/* ---------- APP SHELL ---------- */
#appShell{display:flex;min-height:100vh;}
.sidebar{
  width:236px;flex-shrink:0;
  position:fixed;top:0;left:0;bottom:0;z-index:40;
  display:flex;flex-direction:column;
  padding:20px 14px;
  background:rgba(13,17,30,0.7);
  border-right:1px solid var(--glass-border);
  backdrop-filter:blur(24px) saturate(150%);
  -webkit-backdrop-filter:blur(24px) saturate(150%);
  transition:transform .3s var(--ease);
  overflow-y:auto;
}
.brand{display:flex;align-items:center;gap:10px;padding:6px 8px 22px;}
.brand-mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(140deg,#7c3aed,#4c1d95);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0;}
.brand-name{font-weight:800;font-size:15.5px;letter-spacing:-0.2px;}
.brand-sub{font-size:10.5px;color:var(--text-faint);margin-top:1px;}
.nav-group-label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-faint);padding:14px 12px 6px;font-weight:700;}
.nav-item{
  display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;
  font-size:13.5px;font-weight:600;color:var(--text-dim);cursor:pointer;margin-bottom:2px;
  transition:background .15s,color .15s;position:relative;
}
.nav-item .ic{font-size:16px;width:20px;text-align:center;flex-shrink:0;}
.nav-item:hover{background:rgba(255,255,255,0.05);color:var(--text);}
.nav-item.active{background:linear-gradient(135deg,rgba(124,58,237,0.28),rgba(124,58,237,0.1));color:#fff;}
.nav-item.active::before{content:'';position:absolute;left:-14px;top:8px;bottom:8px;width:3px;border-radius:3px;background:var(--accent-2);}
.nav-badge{margin-left:auto;background:rgba(124,58,237,0.3);color:#e9d8ff;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;}
.sidebar-foot{margin-top:auto;padding:10px 8px;}
.logout-btn{width:100%;}

.main-area{flex:1;margin-left:236px;min-height:100vh;display:flex;flex-direction:column;}
.topbar{
  position:sticky;top:0;z-index:30;
  display:flex;align-items:center;gap:14px;
  padding:14px 26px;
  background:rgba(11,15,26,0.55);
  border-bottom:1px solid var(--glass-border);
  backdrop-filter:blur(18px) saturate(150%);
  -webkit-backdrop-filter:blur(18px) saturate(150%);
}
.menu-toggle{display:none;}
.topbar-title{font-size:18px;font-weight:700;letter-spacing:-0.3px;}
.topbar-sub{font-size:12px;color:var(--text-faint);margin-top:1px;}
.topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;}
.icon-btn{
  width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);cursor:pointer;font-size:16px;
  position:relative;color:var(--text-dim);transition:background .15s;
}
.icon-btn:hover{background:rgba(255,255,255,0.1);color:var(--text);}
.icon-dot{position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--red);border:2px solid var(--bg);display:none;}
.avatar-chip{display:flex;align-items:center;gap:9px;padding:6px 12px 6px 6px;border-radius:30px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);}
.avatar-circ{width:28px;height:28px;border-radius:50%;background:linear-gradient(140deg,#a78bfa,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;}
.avatar-name{font-size:12.5px;font-weight:700;}
.avatar-role{font-size:10px;color:var(--text-faint);}

main#mainContent{padding:24px 26px 60px;}
.view-section{display:none;animation:viewIn .35s var(--ease);}
.view-section.active{display:block;}
@keyframes viewIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}

/* ---------- CARDS / GRID ---------- */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:22px;}
.stat-card{
  padding:18px 20px;position:relative;overflow:hidden;
}
.stat-card .ic-badge{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:12px;}
.stat-card .stat-val{font-size:25px;font-weight:800;letter-spacing:-0.5px;}
.stat-card .stat-label{font-size:12px;color:var(--text-dim);margin-top:3px;font-weight:600;}
.stat-card .stat-trend{font-size:11px;margin-top:8px;font-weight:700;}
.trend-up{color:var(--green);}
.trend-down{color:var(--red);}
.bg-violet{background:rgba(124,58,237,0.18);color:#c4b5fd;}
.bg-green{background:rgba(34,197,94,0.16);color:#86efac;}
.bg-blue{background:rgba(56,189,248,0.16);color:#7dd3fc;}
.bg-amber{background:rgba(251,191,36,0.16);color:#fde68a;}
.bg-red{background:rgba(248,113,113,0.16);color:#fca5a5;}

.panel{padding:22px;margin-bottom:20px;}
.panel-head{display:flex;align-items:center;justify-content:between;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
.panel-title{font-size:15.5px;font-weight:700;}
.panel-title .sm{font-size:11.5px;color:var(--text-faint);font-weight:600;margin-left:8px;}
.panel-actions{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap;}

.dash-grid2{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;}
.dash-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}

/* ---------- TOOLBAR / SEARCH / FILTER ---------- */
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;}
.search-box{position:relative;flex:1;min-width:180px;max-width:320px;}
.search-box input{width:100%;padding:9px 14px 9px 34px;border-radius:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:var(--text);font-size:13px;}
.search-box .ic{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--text-faint);}
.filter-select{padding:9px 30px 9px 12px;border-radius:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:var(--text);font-size:13px;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%239aa3b8'/></svg>");background-repeat:no-repeat;background-position:right 12px center;}

/* ---------- TABLE ---------- */
.table-wrap{overflow-x:auto;border-radius:14px;border:1px solid var(--glass-border);}
table.data-table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px;}
table.data-table thead th{
  text-align:left;padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;
  color:var(--text-faint);font-weight:700;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--glass-border);white-space:nowrap;
}
table.data-table tbody td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);color:var(--text);white-space:nowrap;}
table.data-table tbody tr{transition:background .15s;}
table.data-table tbody tr:hover{background:rgba(255,255,255,0.035);}
table.data-table tbody tr:last-child td{border-bottom:none;}
.cell-strong{font-weight:700;}
.cell-dim{color:var(--text-dim);font-size:12px;}
.row-actions{display:flex;gap:6px;}
.row-actions .btn-icon{width:30px;height:30px;font-size:13px;}

.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.2px;white-space:nowrap;}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;}
.badge-new{background:rgba(56,189,248,0.15);color:#7dd3fc;}
.badge-contacted{background:rgba(251,191,36,0.15);color:#fde68a;}
.badge-followup{background:rgba(167,139,250,0.15);color:#c4b5fd;}
.badge-negotiation{background:rgba(251,146,60,0.15);color:#fdba74;}
.badge-closed{background:rgba(34,197,94,0.15);color:#86efac;}
.badge-lost{background:rgba(248,113,113,0.15);color:#fca5a5;}
.badge-assigned{background:rgba(56,189,248,0.15);color:#7dd3fc;}
.badge-freelancerassigned{background:rgba(167,139,250,0.15);color:#c4b5fd;}
.badge-inprogress{background:rgba(251,191,36,0.15);color:#fde68a;}
.badge-revision{background:rgba(251,146,60,0.15);color:#fdba74;}
.badge-delivered{background:rgba(56,189,248,0.15);color:#7dd3fc;}
.badge-completed{background:rgba(34,197,94,0.15);color:#86efac;}
.badge-pending{background:rgba(248,113,113,0.15);color:#fca5a5;}
.badge-partial{background:rgba(251,191,36,0.15);color:#fde68a;}
.badge-paid{background:rgba(34,197,94,0.15);color:#86efac;}

.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 20px;text-align:center;}
.empty-state .ic{font-size:34px;margin-bottom:10px;opacity:0.6;}
.empty-state .t{font-weight:700;font-size:14px;margin-bottom:4px;}
.empty-state .s{font-size:12.5px;color:var(--text-faint);max-width:280px;}

/* ---------- MODAL ---------- */
.modal-overlay{
  position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
  background:rgba(5,7,14,0.6);backdrop-filter:blur(6px);padding:20px;
  animation:fadeIn .2s var(--ease);
}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
.modal-box{
  width:100%;max-width:560px;max-height:88vh;overflow-y:auto;
  padding:26px 26px 22px;
  animation:modalIn .25s var(--ease);
}
@keyframes modalIn{from{opacity:0;transform:translateY(10px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}
.modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
.modal-title{font-size:17px;font-weight:700;}
.modal-close{width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,0.06);border:none;color:var(--text-dim);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.modal-close:hover{background:rgba(255,255,255,0.12);}
.modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:20px;}
.form-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px;}
.detail-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;}
.detail-row span:first-child{color:var(--text-dim);}
.detail-row span:last-child{font-weight:700;}
.detail-section-title{font-size:11.5px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-faint);font-weight:700;margin:18px 0 8px;}

/* ---------- KANBAN ---------- */
.kanban-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;}
.kanban-col{flex:0 0 250px;background:rgba(255,255,255,0.025);border:1px solid var(--glass-border);border-radius:16px;padding:12px;min-height:200px;display:flex;flex-direction:column;}
.kanban-col.drag-over{background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.4);}
.kanban-col-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:0 4px;}
.kanban-col-title{font-size:12.5px;font-weight:700;}
.kanban-count{margin-left:auto;background:rgba(255,255,255,0.08);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;color:var(--text-dim);}
.kanban-cards{display:flex;flex-direction:column;gap:8px;min-height:80px;}
.kanban-card{
  background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:12px;padding:11px 12px;cursor:grab;
  transition:transform .15s,box-shadow .15s;
}
.kanban-card:active{cursor:grabbing;}
.kanban-card.dragging{opacity:0.4;}
.kanban-card:hover{box-shadow:0 8px 18px rgba(0,0,0,0.3);transform:translateY(-1px);}
.kanban-card .kc-name{font-size:13px;font-weight:700;margin-bottom:4px;}
.kanban-card .kc-meta{font-size:11px;color:var(--text-faint);display:flex;justify-content:space-between;align-items:center;}
.kanban-card .kc-tag{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;padding:1px 6px;border-radius:6px;}

/* ---------- TOASTS ---------- */
#toastContainer{position:fixed;top:18px;right:18px;z-index:500;display:flex;flex-direction:column;gap:10px;max-width:320px;}
.toast{
  padding:13px 16px;border-radius:13px;font-size:13px;font-weight:600;display:flex;align-items:flex-start;gap:10px;
  background:rgba(20,24,38,0.92);border:1px solid var(--glass-border);backdrop-filter:blur(20px);
  box-shadow:0 14px 32px rgba(0,0,0,0.4);animation:toastIn .3s var(--ease);
}
@keyframes toastIn{from{opacity:0;transform:translateX(30px);}to{opacity:1;transform:translateX(0);}}
.toast.out{animation:toastOut .25s var(--ease) forwards;}
@keyframes toastOut{to{opacity:0;transform:translateX(30px);}}
.toast .t-ic{font-size:16px;flex-shrink:0;}
.toast.t-success{border-color:rgba(34,197,94,0.3);}
.toast.t-error{border-color:rgba(248,113,113,0.3);}
.toast.t-info{border-color:rgba(56,189,248,0.3);}

/* ---------- NOTIFICATIONS PANEL ---------- */
.notif-panel{
  position:absolute;top:54px;right:26px;width:320px;max-height:400px;overflow-y:auto;z-index:60;
  padding:8px;display:none;
}
.notif-panel.show{display:block;animation:floatIn .2s var(--ease);}
.notif-item{padding:11px 12px;border-radius:11px;margin-bottom:4px;font-size:12.5px;cursor:pointer;}
.notif-item:hover{background:rgba(255,255,255,0.05);}
.notif-item .ni-msg{font-weight:600;margin-bottom:2px;}
.notif-item .ni-time{font-size:10.5px;color:var(--text-faint);}
.notif-item.unread{background:rgba(124,58,237,0.07);}

/* ---------- PROGRESS ---------- */
.progress-track{width:100%;height:8px;border-radius:8px;background:rgba(255,255,255,0.08);overflow:hidden;}
.progress-fill{height:100%;border-radius:8px;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .4s var(--ease);}

/* ---------- ANALYTICS ---------- */
.chart-card canvas{width:100%;display:block;}
.legend-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;font-size:11.5px;color:var(--text-dim);}
.legend-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;}

/* ---------- ACTIVITY LOG ---------- */
.activity-item{display:flex;gap:12px;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,0.05);}
.activity-item:last-child{border-bottom:none;}
.activity-ic{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;}
.activity-msg{font-size:13px;font-weight:600;}
.activity-time{font-size:11px;color:var(--text-faint);margin-top:2px;}

/* ---------- SETTINGS ---------- */
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:14px 4px;border-bottom:1px solid rgba(255,255,255,0.06);gap:14px;flex-wrap:wrap;}
.settings-row:last-child{border-bottom:none;}
.settings-row .s-title{font-weight:700;font-size:13.5px;}
.settings-row .s-sub{font-size:12px;color:var(--text-faint);margin-top:2px;}

/* ---------- TRACKING PAGE ---------- */
.track-result{margin-top:22px;}
.track-step{display:flex;align-items:center;gap:10px;padding:10px 0;}
.track-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;background:rgba(255,255,255,0.08);color:var(--text-faint);}
.track-dot.done{background:var(--green);color:#06270f;}
.track-dot.active{background:var(--accent);color:#fff;box-shadow:0 0 0 4px rgba(124,58,237,0.25);}
.track-line{flex:1;height:2px;background:rgba(255,255,255,0.08);}
.track-line.done{background:var(--green);}

/* ---------- MISC ---------- */
.recovery-box{background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:14px 16px;font-family:monospace;font-size:15px;text-align:center;letter-spacing:1.5px;font-weight:700;color:#d8b4fe;margin:14px 0;}
.sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:39;display:none;}

@media (max-width:980px){
  .dash-grid2,.dash-grid3{grid-template-columns:1fr;}
}
@media (max-width:880px){
  .sidebar{transform:translateX(-100%);}
  .sidebar.open{transform:translateX(0);}
  .sidebar-overlay.show{display:block;}
  .main-area{margin-left:0;}
  .menu-toggle{display:flex;}
  .form-grid2{grid-template-columns:1fr;}
  .notif-panel{right:14px;width:88vw;}
}
@media (max-width:520px){
  main#mainContent{padding:16px 14px 50px;}
  .topbar{padding:12px 14px;}
  .stat-grid{grid-template-columns:repeat(2,1fr);}
  .avatar-name,.avatar-role{display:none;}
  #toastContainer{left:14px;right:14px;top:14px;max-width:none;}
}
</style>
</head>
<body>

<!-- ================= LOADING SCREEN ================= -->
<div id="loadingScreen">
  <div class="load-mark">EL</div>
  <div class="load-bar"><i></i></div>
  <div class="load-text">Loading ELITHNIC workspace…</div>
</div>

<!-- ================= LOGIN SCREEN ================= -->
<div id="loginScreen" class="auth-wrap hidden">
  <div class="auth-card glass">
    <div class="auth-logo">EL</div>
    <h1 class="auth-title">ELITHNIC</h1>
    <p class="auth-sub">Agency operations platform — sign in to continue</p>
    <div class="field">
      <label>Admin Password</label>
      <input type="password" id="loginPassword" placeholder="Enter password" autocomplete="current-password">
      <div class="field-err" id="loginErr">Incorrect password. Please try again.</div>
    </div>
    <button class="btn btn-primary btn-block" id="loginBtn">Sign In</button>
    <div class="link-row">
      <a id="forgotPassLink">Forgot password?</a> &nbsp;·&nbsp; <a id="trackLinkFromLogin">Track your project</a>
    </div>
    <div class="auth-foot">Default password: elithnic123 — change it after first login</div>
  </div>
</div>

<!-- ================= FORGOT PASSWORD SCREEN ================= -->
<div id="forgotScreen" class="auth-wrap hidden">
  <div class="auth-card glass">
    <div class="auth-logo">EL</div>
    <h1 class="auth-title">Reset Password</h1>
    <p class="auth-sub">Enter your recovery key to set a new password</p>
    <div class="field">
      <label>Recovery Key</label>
      <input type="text" id="recoveryInput" placeholder="ELI-XXXX-XXXX-XXXX">
    </div>
    <div class="field">
      <label>New Password</label>
      <input type="password" id="forgotNewPass" placeholder="Minimum 6 characters">
    </div>
    <div class="field-err" id="forgotErr">Recovery key does not match.</div>
    <button class="btn btn-primary btn-block" id="forgotResetBtn">Reset Password</button>
    <div class="link-row"><a id="backToLoginLink">Back to login</a></div>
  </div>
</div>

<!-- ================= CLIENT TRACKING SCREEN (public) ================= -->
<div id="trackScreen" class="auth-wrap hidden">
  <div class="auth-card glass" style="max-width:480px;">
    <div class="auth-logo">EL</div>
    <h1 class="auth-title">Track Your Project</h1>
    <p class="auth-sub">Enter the tracking ID shared by your account manager</p>
    <div class="field">
      <label>Tracking ID</label>
      <input type="text" id="trackInput" placeholder="e.g. ELI-1001">
    </div>
    <button class="btn btn-primary btn-block" id="trackBtn">Track Project</button>
    <div id="trackResultBox" class="track-result hidden"></div>
    <div class="link-row"><a id="backToLoginFromTrack">Back to login</a></div>
  </div>
</div>

<!-- ================= APP SHELL ================= -->
<div id="appShell" class="hidden">
  <div class="sidebar-overlay" id="sidebarOverlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <div class="brand-mark">EL</div>
      <div>
        <div class="brand-name">ELITHNIC</div>
        <div class="brand-sub">Operations Platform</div>
      </div>
    </div>
    <div class="nav-group-label">Overview</div>
    <div class="nav-item active" data-view="dashboard"><span class="ic">⌂</span> Dashboard</div>
    <div class="nav-item" data-view="kanban"><span class="ic">▦</span> Pipeline</div>
    <div class="nav-group-label">Sales</div>
    <div class="nav-item" data-view="leads"><span class="ic">◎</span> Leads <span class="nav-badge" id="navLeadsBadge">0</span></div>
    <div class="nav-item" data-view="closers"><span class="ic">◈</span> Closers</div>
    <div class="nav-group-label">Delivery</div>
    <div class="nav-item" data-view="projects"><span class="ic">▣</span> Projects <span class="nav-badge" id="navProjectsBadge">0</span></div>
    <div class="nav-item" data-view="dp"><span class="ic">◇</span> Delivery Partners</div>
    <div class="nav-item" data-view="freelancers"><span class="ic">✦</span> Freelancers</div>
    <div class="nav-group-label">Finance</div>
    <div class="nav-item" data-view="payments"><span class="ic">$</span> Payments</div>
    <div class="nav-item" data-view="analytics"><span class="ic">▱</span> Analytics</div>
    <div class="nav-group-label">System</div>
    <div class="nav-item" data-view="activity"><span class="ic">≡</span> Activity Log</div>
    <div class="nav-item" data-view="backup"><span class="ic">⇄</span> Backup &amp; Export</div>
    <div class="nav-item" data-view="settings"><span class="ic">⚙</span> Settings</div>
    <div class="sidebar-foot">
      <button class="btn btn-ghost logout-btn" id="logoutBtn">⏻ Logout</button>
    </div>
  </aside>

  <div class="main-area">
    <div class="topbar">
      <button class="icon-btn menu-toggle" id="menuToggle">☰</button>
      <div>
        <div class="topbar-title" id="topbarTitle">Dashboard</div>
        <div class="topbar-sub" id="topbarSub">Welcome back — here's what's happening today</div>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" id="notifBtn">🔔<span class="icon-dot" id="notifDot"></span></button>
        <div class="avatar-chip">
          <div class="avatar-circ">A</div>
          <div>
            <div class="avatar-name">Admin</div>
            <div class="avatar-role">Owner</div>
          </div>
        </div>
      </div>
      <div class="notif-panel glass" id="notifPanel"></div>
    </div>

    <main id="mainContent">
      <!-- ============ DASHBOARD ============ -->
      <section class="view-section active" id="view-dashboard"></section>
      <!-- ============ KANBAN ============ -->
      <section class="view-section" id="view-kanban"></section>
      <!-- ============ LEADS ============ -->
      <section class="view-section" id="view-leads"></section>
      <!-- ============ CLOSERS ============ -->
      <section class="view-section" id="view-closers"></section>
      <!-- ============ PROJECTS ============ -->
      <section class="view-section" id="view-projects"></section>
      <!-- ============ DELIVERY PARTNERS ============ -->
      <section class="view-section" id="view-dp"></section>
      <!-- ============ FREELANCERS ============ -->
      <section class="view-section" id="view-freelancers"></section>
      <!-- ============ PAYMENTS ============ -->
      <section class="view-section" id="view-payments"></section>
      <!-- ============ ANALYTICS ============ -->
      <section class="view-section" id="view-analytics"></section>
      <!-- ============ ACTIVITY LOG ============ -->
      <section class="view-section" id="view-activity"></section>
      <!-- ============ BACKUP ============ -->
      <section class="view-section" id="view-backup"></section>
      <!-- ============ SETTINGS ============ -->
      <section class="view-section" id="view-settings"></section>
    </main>
  </div>
</div>

<div id="modalRoot"></div>
<div id="toastContainer"></div>

<script>
/* =====================================================================
   ELITHNIC — Agency Operations Platform
   Single-file vanilla JS application. No frameworks, no dependencies.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CONSTANTS & CONFIG
   --------------------------------------------------------------------- */
const DB_KEY = 'elithnic_db_v1';
const SESSION_KEY = 'elithnic_session_v1';

const SERVICES = ['Social Media Management','Web Design & Development','SEO','Content Writing','Graphic Design','Video Editing','Paid Ads Management','Branding & Identity','App Development','Email Marketing','Other'];
const LEAD_STATUSES = ['New Lead','Contacted','Follow Up','Negotiation','Closed','Lost'];
const PROJECT_STATUSES = ['Assigned','Freelancer Assigned','In Progress','Revision','Delivered','Completed'];
const SKILLS = ['Graphic Design','Web Development','Content Writing','Video Editing','SEO','Social Media','Paid Ads','App Development','UI/UX Design','Copywriting','Other'];

const KANBAN_LEAD_COLS = ['New Lead','Contacted','Negotiation','Closed'];
const KANBAN_PROJECT_COLS = ['Delivery','Completed'];
const KANBAN_COLS = [...KANBAN_LEAD_COLS, ...KANBAN_PROJECT_COLS];

const STATUS_BADGE_CLASS = {
  'New Lead':'badge-new','Contacted':'badge-contacted','Follow Up':'badge-followup','Negotiation':'badge-negotiation',
  'Closed':'badge-closed','Lost':'badge-lost','Assigned':'badge-assigned','Freelancer Assigned':'badge-freelancerassigned',
  'In Progress':'badge-inprogress','Revision':'badge-revision','Delivered':'badge-delivered','Completed':'badge-completed',
  'Pending':'badge-pending','Partial':'badge-partial','Paid':'badge-paid'
};

/* ---------------------------------------------------------------------
   2. UTILITIES
   --------------------------------------------------------------------- */
function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function fmtMoney(n){
  n = Number(n)||0;
  return '₹' + n.toLocaleString('en-IN', {maximumFractionDigits:0});
}
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});
}
function fmtDateTime(d){
  const dt = new Date(d);
  if(isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) + ' · ' + dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function escapeHtml(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }
function badgeClassFor(status){ return STATUS_BADGE_CLASS[status] || 'badge-new'; }

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomRecoveryKey(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b=>chars[b % chars.length]).join('');
  return 'ELI-' + seg() + '-' + seg() + '-' + seg();
}

function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

/* ---------------------------------------------------------------------
   3. DATA LAYER (localStorage)
   --------------------------------------------------------------------- */
function defaultDB(){
  return {
    auth: { passwordHash: null, recoveryKeyHash: null, recoveryShown:false },
    leads: [], closers: [], deliveryPartners: [], freelancers: [], projects: [],
    activities: [], notifications: [],
    counters: { lead:0, closer:0, dp:0, freelancer:0, project:1000 },
    meta: { createdAt: new Date().toISOString() }
  };
}

let DB = null;

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    DB = raw ? JSON.parse(raw) : defaultDB();
  }catch(e){
    console.error('DB load failed, resetting', e);
    DB = defaultDB();
  }
  // schema patch for forward-compat
  const d = defaultDB();
  for(const k in d){ if(!(k in DB)) DB[k] = d[k]; }
  for(const k in d.counters){ if(!(k in DB.counters)) DB.counters[k] = d.counters[k]; }
  return DB;
}
function saveDB(){
  localStorage.setItem(DB_KEY, JSON.stringify(DB));
}
function nextCounter(name){
  DB.counters[name] = (DB.counters[name]||0) + 1;
  saveDB();
  return DB.counters[name];
}
function nextTrackingId(){
  const n = nextCounter('project');
  return 'ELI-' + n;
}

/* generic collection helpers */
function getAll(coll){ return DB[coll] || []; }
function getById(coll, id){ return getAll(coll).find(x => x.id === id); }
function upsert(coll, record){
  const arr = DB[coll];
  const idx = arr.findIndex(x => x.id === record.id);
  if(idx >= 0) arr[idx] = record; else arr.push(record);
  saveDB();
}
function removeById(coll, id){
  DB[coll] = DB[coll].filter(x => x.id !== id);
  saveDB();
}

/* ---------------------------------------------------------------------
   4. ACTIVITY LOG + NOTIFICATIONS + TOASTS
   --------------------------------------------------------------------- */
function logActivity(type, message){
  DB.activities.unshift({ id: uid('act'), type, message, timestamp: new Date().toISOString() });
  if(DB.activities.length > 100) DB.activities = DB.activities.slice(0,100);
  saveDB();
  if(document.getElementById('view-activity').classList.contains('active')) renderActivityView();
}
function pushNotification(message, type){
  DB.notifications.unshift({ id: uid('notif'), message, type: type||'info', read:false, timestamp: new Date().toISOString() });
  if(DB.notifications.length > 60) DB.notifications = DB.notifications.slice(0,60);
  saveDB();
  renderNotifDot();
}
function toast(message, type){
  type = type || 'info';
  const icons = {success:'✓', error:'✕', info:'ℹ'};
  const el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.innerHTML = '<span class="t-ic">'+icons[type]+'</span><span>'+escapeHtml(message)+'</span>';
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 280); }, 3200);
}

/* ---------------------------------------------------------------------
   5. AUTH
   --------------------------------------------------------------------- */
async function ensureDefaultAuth(){
  if(!DB.auth.passwordHash){
    DB.auth.passwordHash = await sha256('elithnic123');
    const key = randomRecoveryKey();
    DB.auth.recoveryKeyHash = await sha256(key);
    saveDB();
    return key; // shown once to the user
  }
  return null;
}
function isLoggedIn(){
  try{ return sessionStorage.getItem(SESSION_KEY) === '1' || localStorage.getItem(SESSION_KEY) === '1'; }
  catch(e){ return false; }
}
function setLoggedIn(remember){
  if(remember) localStorage.setItem(SESSION_KEY, '1');
  sessionStorage.setItem(SESSION_KEY, '1');
}
function clearLoggedIn(){
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

async function handleLogin(){
  const pass = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginErr');
  if(!pass){ err.style.display='block'; err.textContent='Please enter your password.'; return; }
  const hash = await sha256(pass);
  if(hash === DB.auth.passwordHash){
    err.style.display='none';
    setLoggedIn(true);
    document.getElementById('loginPassword').value='';
    showApp();
    toast('Welcome back, Admin', 'success');
  }else{
    err.style.display='block';
    err.textContent='Incorrect password. Please try again.';
  }
}
async function handleForgotReset(){
  const key = document.getElementById('recoveryInput').value.trim().toUpperCase();
  const newPass = document.getElementById('forgotNewPass').value;
  const err = document.getElementById('forgotErr');
  if(!key || !newPass || newPass.length < 6){
    err.style.display='block'; err.textContent='Enter a valid recovery key and a password (min 6 characters).'; return;
  }
  const hash = await sha256(key);
  if(hash === DB.auth.recoveryKeyHash){
    DB.auth.passwordHash = await sha256(newPass);
    saveDB();
    err.style.display='none';
    toast('Password reset successfully. Please sign in.', 'success');
    showScreen('loginScreen');
  }else{
    err.style.display='block'; err.textContent='Recovery key does not match our records.';
  }
}
async function handleChangePassword(){
  const cur = document.getElementById('settingsCurPass').value;
  const next = document.getElementById('settingsNewPass').value;
  const confirm_ = document.getElementById('settingsConfirmPass').value;
  if(!cur || !next || !confirm_){ toast('Please fill all password fields', 'error'); return; }
  const hash = await sha256(cur);
  if(hash !== DB.auth.passwordHash){ toast('Current password is incorrect', 'error'); return; }
  if(next.length < 6){ toast('New password must be at least 6 characters', 'error'); return; }
  if(next !== confirm_){ toast('New password and confirmation do not match', 'error'); return; }
  DB.auth.passwordHash = await sha256(next);
  saveDB();
  document.getElementById('settingsCurPass').value='';
  document.getElementById('settingsNewPass').value='';
  document.getElementById('settingsConfirmPass').value='';
  toast('Password changed successfully', 'success');
  logActivity('Settings', 'Admin password was changed');
}
function handleLogout(){
  clearLoggedIn();
  closeAllPanels();
  showScreen('loginScreen');
  toast('Signed out', 'info');
}

/* ---------------------------------------------------------------------
   6. SCREEN / ROUTING
   --------------------------------------------------------------------- */
function showScreen(id){
  ['loadingScreen','loginScreen','forgotScreen','trackScreen','appShell'].forEach(s=>{
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}
function showApp(){
  showScreen('appShell');
  renderAll();
  navigateTo('dashboard');
}

const VIEW_META = {
  dashboard:{title:'Dashboard', sub:"Welcome back — here's what's happening today"},
  kanban:{title:'Pipeline', sub:'Drag cards across stages to update status'},
  leads:{title:'Leads', sub:'Track and manage every inbound opportunity'},
  closers:{title:'Closers', sub:'Manage your sales team and commission payouts'},
  projects:{title:'Projects', sub:'Deliver client work end-to-end'},
  dp:{title:'Delivery Partners', sub:'Manage fulfillment partners and earnings'},
  freelancers:{title:'Freelancers', sub:'Your bench of vetted talent'},
  payments:{title:'Payments', sub:'Track advances, dues and payment status'},
  analytics:{title:'Analytics', sub:'Revenue, profit and pipeline performance'},
  activity:{title:'Activity Log', sub:'A live record of everything happening in your agency'},
  backup:{title:'Backup & Export', sub:'Protect your data and export reports'},
  settings:{title:'Settings', sub:'Account security and preferences'}
};

function navigateTo(view){
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === 'view-'+view));
  const meta = VIEW_META[view];
  document.getElementById('topbarTitle').textContent = meta.title;
  document.getElementById('topbarSub').textContent = meta.sub;
  closeSidebarMobile();
  closeAllPanels();
  RENDER_MAP[view] && RENDER_MAP[view]();
  window.scrollTo({top:0, behavior:'smooth'});
}
function closeSidebarMobile(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function closeAllPanels(){
  document.getElementById('notifPanel').classList.remove('show');
}

/* ---------------------------------------------------------------------
   7. ENTITY CONFIG (drives generic CRUD forms across modules)
   --------------------------------------------------------------------- */
function closerOptions(){ return getAll('closers').map(c=>({value:c.id,label:c.name})); }
function dpOptions(){ return getAll('deliveryPartners').map(c=>({value:c.id,label:c.name})); }
function freelancerOptions(){ return getAll('freelancers').map(c=>({value:c.id,label:c.name+' ('+c.skill+')'})); }
function leadOptions(){ return getAll('leads').map(c=>({value:c.id,label:c.clientName+' — '+c.service})); }
function closerName(id){ const c=getById('closers',id); return c? c.name : '—'; }
function dpName(id){ const c=getById('deliveryPartners',id); return c? c.name : '—'; }
function freelancerName(id){ const c=getById('freelancers',id); return c? c.name : '—'; }

const ENTITY_CONFIG = {
  leads: { coll:'leads', label:'Lead', icon:'◎', idPrefix:'lead',
    fields:[
      {key:'clientName', label:'Client Name', type:'text', required:true, col:6},
      {key:'whatsapp', label:'WhatsApp Number', type:'tel', required:true, col:6, placeholder:'+91 98xxxxxxx'},
      {key:'email', label:'Email Address', type:'email', col:6},
      {key:'service', label:'Service Interested In', type:'select', options:SERVICES, col:6},
      {key:'budget', label:'Budget (₹)', type:'number', col:6},
      {key:'assignedCloserId', label:'Assigned Closer', type:'select', dynOptions:closerOptions, emptyLabel:'Unassigned', col:6},
      {key:'status', label:'Status', type:'select', options:LEAD_STATUSES, default:'New Lead', col:6},
      {key:'requirements', label:'Requirements / Notes', type:'textarea', col:12}
    ]
  },
  closers: { coll:'closers', label:'Closer', icon:'◈', idPrefix:'closer',
    fields:[
      {key:'name', label:'Full Name', type:'text', required:true, col:6},
      {key:'whatsapp', label:'WhatsApp Number', type:'tel', required:true, col:6},
      {key:'email', label:'Email Address', type:'email', col:6},
      {key:'commissionRate', label:'Standard Commission %', type:'number', step:0.5, default:10, col:6}
    ]
  },
  deliveryPartners: { coll:'deliveryPartners', label:'Delivery Partner', icon:'◇', idPrefix:'dp',
    fields:[
      {key:'name', label:'Full Name', type:'text', required:true, col:6},
      {key:'whatsapp', label:'WhatsApp Number', type:'tel', required:true, col:6},
      {key:'email', label:'Email Address', type:'email', col:6},
      {key:'commissionRate', label:'Standard Commission %', type:'number', step:0.5, default:15, col:6}
    ]
  },
  freelancers: { coll:'freelancers', label:'Freelancer', icon:'✦', idPrefix:'fl',
    fields:[
      {key:'name', label:'Full Name', type:'text', required:true, col:6},
      {key:'skill', label:'Primary Skill', type:'select', options:SKILLS, col:6},
      {key:'whatsapp', label:'WhatsApp Number', type:'tel', col:6},
      {key:'email', label:'Email Address', type:'email', col:6},
      {key:'rating', label:'Rating (1.0 – 5.0)', type:'number', min:1, max:5, step:0.1, default:5, col:6}
    ]
  },
  projects: { coll:'projects', label:'Project', icon:'▣', idPrefix:'proj',
    fields:[
      {key:'clientName', label:'Client Name', type:'text', required:true, col:6},
      {key:'service', label:'Service', type:'select', options:SERVICES, col:6},
      {key:'leadId', label:'Source Lead', type:'select', dynOptions:leadOptions, emptyLabel:'No linked lead', col:6},
      {key:'closerId', label:'Closer', type:'select', dynOptions:closerOptions, emptyLabel:'Unassigned', col:6},
      {key:'dpId', label:'Delivery Partner', type:'select', dynOptions:dpOptions, emptyLabel:'Unassigned', col:6},
      {key:'freelancerId', label:'Freelancer', type:'select', dynOptions:freelancerOptions, emptyLabel:'Unassigned', col:6},
      {key:'totalPrice', label:'Total Project Value (₹)', type:'number', required:true, col:6},
      {key:'advancePayment', label:'Advance Received (₹)', type:'number', default:0, col:6},
      {key:'freelancerCost', label:'Freelancer Cost (₹)', type:'number', default:0, col:6},
      {key:'closerCommission', label:'Closer Commission (₹)', type:'number', default:0, col:6},
      {key:'dpCommission', label:'Delivery Partner Commission (₹)', type:'number', default:0, col:6},
      {key:'deadline', label:'Deadline', type:'date', col:6},
      {key:'status', label:'Status', type:'select', options:PROJECT_STATUSES, default:'Assigned', col:6}
    ]
  }
};

/* ---------------------------------------------------------------------
   8. GENERIC MODAL FORM ENGINE
   --------------------------------------------------------------------- */
let MODAL_STATE = { entity:null, recordId:null, onSaved:null };

function fieldOptionsHTML(field, currentVal){
  let opts = field.options ? field.options.map(o=>({value:o,label:o})) : (field.dynOptions ? field.dynOptions() : []);
  let html = '<option value="">'+(field.emptyLabel || 'Select '+field.label)+'</option>';
  opts.forEach(o=>{
    const sel = (String(currentVal) === String(o.value)) ? 'selected' : '';
    html += '<option value="'+escapeHtml(o.value)+'" '+sel+'>'+escapeHtml(o.label)+'</option>';
  });
  return html;
}
function buildFieldHTML(field, record){
  const val = record && record[field.key] !== undefined ? record[field.key] : (field.default !== undefined ? field.default : '');
  const wrapStyle = field.col === 12 ? 'grid-column:1/-1;' : '';
  let inner = '';
  if(field.type === 'select'){
    inner = '<select id="f_'+field.key+'">'+fieldOptionsHTML(field, val)+'</select>';
  }else if(field.type === 'textarea'){
    inner = '<textarea id="f_'+field.key+'" placeholder="'+escapeHtml(field.placeholder||'')+'">'+escapeHtml(val)+'</textarea>';
  }else{
    const extra = [];
    if(field.min !== undefined) extra.push('min="'+field.min+'"');
    if(field.max !== undefined) extra.push('max="'+field.max+'"');
    if(field.step !== undefined) extra.push('step="'+field.step+'"');
    inner = '<input type="'+field.type+'" id="f_'+field.key+'" value="'+escapeHtml(val)+'" placeholder="'+escapeHtml(field.placeholder||'')+'" '+extra.join(' ')+'>';
  }
  return '<div class="field" style="'+wrapStyle+'"><label>'+field.label+(field.required?' *':'')+'</label>'+inner+'</div>';
}

function openFormModal(entityKey, recordId){
  const cfg = ENTITY_CONFIG[entityKey];
  const record = recordId ? getById(cfg.coll, recordId) : null;
  MODAL_STATE = { entity: entityKey, recordId: recordId || null };
  const fieldsHTML = cfg.fields.map(f => buildFieldHTML(f, record)).join('');
  const title = (record ? 'Edit ' : 'Add New ') + cfg.label;
  renderModal(`
    <div class="modal-head">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="form-grid2">${fieldsHTML}</div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEntityForm()">${record?'Save Changes':'Create '+cfg.label}</button>
    </div>
  `);
}

function submitEntityForm(){
  const entityKey = MODAL_STATE.entity;
  const cfg = ENTITY_CONFIG[entityKey];
  const data = {};
  for(const f of cfg.fields){
    const el = document.getElementById('f_'+f.key);
    if(!el) continue;
    let v = el.value;
    if(f.type === 'number') v = v === '' ? 0 : parseFloat(v);
    if(f.required && (v === '' || v === null || v === undefined)){
      toast('"'+f.label+'" is required', 'error');
      el.focus();
      return;
    }
    data[f.key] = v;
  }
  let record;
  let isNew = !MODAL_STATE.recordId;
  if(isNew){
    record = Object.assign({ id: uid(cfg.idPrefix), createdDate: todayISO() }, data);
    if(entityKey === 'projects'){ record.trackingId = nextTrackingId(); }
  }else{
    record = Object.assign({}, getById(cfg.coll, MODAL_STATE.recordId), data);
  }
  upsert(cfg.coll, record);

  if(entityKey === 'leads'){
    logActivity('Lead', (isNew?'New lead created: ':'Lead updated: ')+record.clientName);
    if(isNew) pushNotification('New lead added: '+record.clientName, 'lead');
  }else if(entityKey === 'projects'){
    logActivity('Project', (isNew?'New project created: ':'Project updated: ')+record.clientName+' ('+record.trackingId+')');
    if(isNew) pushNotification('Project created for '+record.clientName+' — '+record.trackingId, 'project');
  }else{
    logActivity(cfg.label, (isNew?'New '+cfg.label+' added: ':cfg.label+' updated: ')+(record.name||record.clientName));
  }

  closeModal();
  toast(cfg.label+' '+(isNew?'created':'updated')+' successfully', 'success');
  renderAll();
}

function confirmDelete(entityKey, recordId, label){
  const cfg = ENTITY_CONFIG[entityKey];
  renderModal(`
    <div class="modal-head">
      <div class="modal-title">Delete ${cfg.label}?</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13.5px;color:var(--text-dim);line-height:1.5;">
      Are you sure you want to delete <strong style="color:var(--text)">${escapeHtml(label)}</strong>? This action cannot be undone.
    </p>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doDelete('${entityKey}','${recordId}','${escapeHtml(label)}')">Delete</button>
    </div>
  `);
}
function doDelete(entityKey, recordId, label){
  const cfg = ENTITY_CONFIG[entityKey];
  removeById(cfg.coll, recordId);
  logActivity(cfg.label, cfg.label+' deleted: '+label);
  closeModal();
  toast(cfg.label+' deleted', 'success');
  renderAll();
}

function renderModal(innerHTML){
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay" id="activeModalOverlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-box glass">${innerHTML}</div>
    </div>`;
}
function closeModal(){
  document.getElementById('modalRoot').innerHTML = '';
  MODAL_STATE = { entity:null, recordId:null };
}

/* ---------------------------------------------------------------------
   9. COMMISSION / FINANCE ENGINE
   --------------------------------------------------------------------- */
function computeProjectFinancials(p){
  const total = Number(p.totalPrice)||0;
  const adv = Number(p.advancePayment)||0;
  const flCost = Number(p.freelancerCost)||0;
  const closerComm = Number(p.closerCommission)||0;
  const dpComm = Number(p.dpCommission)||0;
  const agencyProfit = total - flCost - closerComm - dpComm;
  const remaining = total - adv;
  let paymentStatus = 'Pending';
  if(adv > 0 && adv < total) paymentStatus = 'Partial';
  else if(adv >= total && total > 0) paymentStatus = 'Paid';
  return { total, adv, flCost, closerComm, dpComm, agencyProfit, remaining, paymentStatus };
}
function projectProgressPercent(status){
  const idx = PROJECT_STATUSES.indexOf(status);
  return Math.round(((idx+1) / PROJECT_STATUSES.length) * 100);
}
function closerStats(closerId){
  const leads = getAll('leads').filter(l => l.assignedCloserId === closerId);
  const projects = getAll('projects').filter(p => p.closerId === closerId);
  const closedDeals = leads.filter(l => l.status === 'Closed').length;
  const totalCommission = projects.reduce((s,p)=>s+(Number(p.closerCommission)||0),0);
  return { totalLeads: leads.length, closedDeals, totalCommission, activeProjects: projects.filter(p=>p.status!=='Completed').length };
}
function dpStats(dpId){
  const projects = getAll('projects').filter(p => p.dpId === dpId);
  const activeProjects = projects.filter(p => p.status !== 'Completed').length;
  const totalEarnings = projects.reduce((s,p)=>s+(Number(p.dpCommission)||0),0);
  return { activeProjects, totalEarnings, totalProjects: projects.length };
}
function freelancerStats(flId){
  const projects = getAll('projects').filter(p => p.freelancerId === flId);
  const completedProjects = projects.filter(p => p.status === 'Completed').length;
  const totalEarnings = projects.reduce((s,p)=>s+(Number(p.freelancerCost)||0),0);
  return { completedProjects, totalEarnings, totalProjects: projects.length };
}
function dashboardStats(){
  const leads = getAll('leads');
  const projects = getAll('projects');
  const totalRevenue = projects.reduce((s,p)=>s+(Number(p.totalPrice)||0),0);
  const totalProfit = projects.reduce((s,p)=>s+computeProjectFinancials(p).agencyProfit,0);
  const activeProjects = projects.filter(p=>p.status!=='Completed').length;
  const pendingDeliveries = projects.filter(p=>!['Delivered','Completed'].includes(p.status)).length;
  const pendingPayments = projects.filter(p=>computeProjectFinancials(p).paymentStatus !== 'Paid').length;
  const completedProjects = projects.filter(p=>p.status==='Completed').length;
  return {
    totalLeads: leads.length,
    activeProjects, totalRevenue, totalProfit,
    totalClosers: getAll('closers').length,
    totalDP: getAll('deliveryPartners').length,
    totalFreelancers: getAll('freelancers').length,
    pendingDeliveries, pendingPayments, completedProjects,
    totalProjects: projects.length
  };
}

/* ---------------------------------------------------------------------
   10. DASHBOARD VIEW
   --------------------------------------------------------------------- */
function renderDashboard(){
  const s = dashboardStats();
  const leads = getAll('leads').slice().sort((a,b)=> new Date(b.createdDate)-new Date(a.createdDate)).slice(0,5);
  const upcoming = getAll('projects').filter(p=>p.deadline && p.status!=='Completed')
    .sort((a,b)=> new Date(a.deadline)-new Date(b.deadline)).slice(0,5);
  const activities = getAll('activities').slice(0,6);

  const statCards = [
    {label:'Total Leads', val:s.totalLeads, ic:'◎', bg:'bg-blue'},
    {label:'Active Projects', val:s.activeProjects, ic:'▣', bg:'bg-violet'},
    {label:'Total Revenue', val:fmtMoney(s.totalRevenue), ic:'$', bg:'bg-green'},
    {label:'Total Profit', val:fmtMoney(s.totalProfit), ic:'▲', bg:'bg-green'},
    {label:'Closers', val:s.totalClosers, ic:'◈', bg:'bg-violet'},
    {label:'Delivery Partners', val:s.totalDP, ic:'◇', bg:'bg-blue'},
    {label:'Freelancers', val:s.totalFreelancers, ic:'✦', bg:'bg-amber'},
    {label:'Pending Deliveries', val:s.pendingDeliveries, ic:'⏱', bg:'bg-amber'},
    {label:'Pending Payments', val:s.pendingPayments, ic:'!', bg:'bg-red'},
    {label:'Completed Projects', val:s.completedProjects, ic:'✓', bg:'bg-green'}
  ];

  document.getElementById('view-dashboard').innerHTML = `
    <div class="stat-grid">
      ${statCards.map(c=>`
        <div class="stat-card glass">
          <div class="ic-badge ${c.bg}">${c.ic}</div>
          <div class="stat-val">${c.val}</div>
          <div class="stat-label">${c.label}</div>
        </div>`).join('')}
    </div>
    <div class="dash-grid2">
      <div class="panel glass">
        <div class="panel-head">
          <div class="panel-title">Recent Leads</div>
          <div class="panel-actions"><button class="btn btn-ghost btn-sm" onclick="navigateTo('leads')">View All</button></div>
        </div>
        ${leads.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Client</th><th>Service</th><th>Budget</th><th>Status</th></tr></thead><tbody>
          ${leads.map(l=>`<tr><td class="cell-strong">${escapeHtml(l.clientName)}</td><td>${escapeHtml(l.service||'—')}</td><td>${fmtMoney(l.budget)}</td><td><span class="badge ${badgeClassFor(l.status)}">${l.status}</span></td></tr>`).join('')}
        </tbody></table></div>` : emptyState('◎','No leads yet','New leads you add will show up here.')}
      </div>
      <div class="panel glass">
        <div class="panel-head"><div class="panel-title">Upcoming Deadlines</div></div>
        ${upcoming.length ? upcoming.map(p=>{
          const days = daysBetween(todayISO(), p.deadline);
          const urgent = days <= 2;
          return `<div class="detail-row"><span>${escapeHtml(p.clientName)} <span class="cell-dim">(${p.trackingId})</span></span><span style="color:${urgent?'var(--red)':'var(--text)'}">${fmtDate(p.deadline)}</span></div>`;
        }).join('') : emptyState('⏱','No deadlines','Project deadlines will appear here.')}
      </div>
    </div>
    <div class="dash-grid2">
      <div class="panel glass">
        <div class="panel-head"><div class="panel-title">Recent Activity</div><div class="panel-actions"><button class="btn btn-ghost btn-sm" onclick="navigateTo('activity')">View All</button></div></div>
        ${activities.length ? activities.map(a=>activityItemHTML(a)).join('') : emptyState('≡','No activity yet','Actions across the platform will be logged here.')}
      </div>
      <div class="panel glass">
        <div class="panel-head"><div class="panel-title">Lead Pipeline Snapshot</div></div>
        ${pipelineSnapshotHTML()}
      </div>
    </div>
  `;
  renderNavBadges();
}
function pipelineSnapshotHTML(){
  const leads = getAll('leads');
  if(!leads.length) return emptyState('▦','No pipeline data','Add leads to see your pipeline distribution.');
  const counts = LEAD_STATUSES.map(st => ({st, n: leads.filter(l=>l.status===st).length}));
  const max = Math.max(...counts.map(c=>c.n), 1);
  return counts.map(c => `
    <div style="margin-bottom:11px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span>${c.st}</span><span class="cell-dim">${c.n}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${(c.n/max*100)}%"></div></div>
    </div>`).join('');
}
function emptyState(ic, title, sub){
  return `<div class="empty-state"><div class="ic">${ic}</div><div class="t">${title}</div><div class="s">${sub}</div></div>`;
}
function activityItemHTML(a){
  const icons = {Lead:'◎', Project:'▣', Closer:'◈', 'Delivery Partner':'◇', Freelancer:'✦', Settings:'⚙', System:'⚡', Payment:'$'};
  const ic = icons[a.type] || '•';
  return `<div class="activity-item">
    <div class="activity-ic bg-violet">${ic}</div>
    <div><div class="activity-msg">${escapeHtml(a.message)}</div><div class="activity-time">${fmtDateTime(a.timestamp)}</div></div>
  </div>`;
}
function renderNavBadges(){
  document.getElementById('navLeadsBadge').textContent = getAll('leads').filter(l=>!['Closed','Lost'].includes(l.status)).length;
  document.getElementById('navProjectsBadge').textContent = getAll('projects').filter(p=>p.status!=='Completed').length;
}

/* ---------------------------------------------------------------------
   11. LEADS VIEW
   --------------------------------------------------------------------- */
const FILTERS = { leads:{q:'',status:''}, closers:{q:''}, dp:{q:''}, freelancers:{q:'',skill:''}, projects:{q:'',status:''}, payments:{q:'',status:''} };

function renderLeadsView(){
  document.getElementById('view-leads').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">All Leads <span class="sm">${getAll('leads').length} total</span></div>
        <div class="panel-actions">
          <button class="btn btn-ghost btn-sm" onclick="exportCSV('leads')">⬇ Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="openFormModal('leads')">+ Add Lead</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search leads by name, WhatsApp or email…" id="leadSearchInput" oninput="FILTERS.leads.q=this.value;renderLeadsTable();"></div>
        <select class="filter-select" id="leadStatusFilter" onchange="FILTERS.leads.status=this.value;renderLeadsTable();">
          <option value="">All Statuses</option>
          ${LEAD_STATUSES.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div id="leadsTableWrap"></div>
    </div>
  `;
  document.getElementById('leadSearchInput').value = FILTERS.leads.q;
  document.getElementById('leadStatusFilter').value = FILTERS.leads.status;
  renderLeadsTable();
}
function renderLeadsTable(){
  const f = FILTERS.leads;
  let rows = getAll('leads').slice().sort((a,b)=>new Date(b.createdDate)-new Date(a.createdDate));
  if(f.q) rows = rows.filter(l => (l.clientName+l.whatsapp+(l.email||'')).toLowerCase().includes(f.q.toLowerCase()));
  if(f.status) rows = rows.filter(l => l.status === f.status);
  const wrap = document.getElementById('leadsTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('◎','No leads found','Try adjusting your search or filters, or add a new lead.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Client</th><th>Contact</th><th>Service</th><th>Budget</th><th>Closer</th><th>Status</th><th>Created</th><th></th>
  </tr></thead><tbody>
    ${rows.map(l=>`<tr>
      <td class="cell-strong" style="cursor:pointer" onclick="openLeadDetails('${l.id}')">${escapeHtml(l.clientName)}</td>
      <td><div>${escapeHtml(l.whatsapp)}</div><div class="cell-dim">${escapeHtml(l.email||'')}</div></td>
      <td>${escapeHtml(l.service||'—')}</td>
      <td>${fmtMoney(l.budget)}</td>
      <td>${escapeHtml(closerName(l.assignedCloserId))}</td>
      <td><span class="badge ${badgeClassFor(l.status)}">${l.status}</span></td>
      <td class="cell-dim">${fmtDate(l.createdDate)}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-icon" onclick="openFormModal('leads','${l.id}')" title="Edit">✎</button>
        <button class="btn btn-danger btn-icon" onclick="confirmDelete('leads','${l.id}','${escapeHtml(l.clientName)}')" title="Delete">🗑</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function openLeadDetails(id){
  const l = getById('leads', id);
  if(!l) return;
  renderModal(`
    <div class="modal-head"><div class="modal-title">Lead Details</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="detail-row"><span>Client Name</span><span>${escapeHtml(l.clientName)}</span></div>
    <div class="detail-row"><span>WhatsApp</span><span>${escapeHtml(l.whatsapp)}</span></div>
    <div class="detail-row"><span>Email</span><span>${escapeHtml(l.email||'—')}</span></div>
    <div class="detail-row"><span>Service</span><span>${escapeHtml(l.service||'—')}</span></div>
    <div class="detail-row"><span>Budget</span><span>${fmtMoney(l.budget)}</span></div>
    <div class="detail-row"><span>Assigned Closer</span><span>${escapeHtml(closerName(l.assignedCloserId))}</span></div>
    <div class="detail-row"><span>Status</span><span><span class="badge ${badgeClassFor(l.status)}">${l.status}</span></span></div>
    <div class="detail-row"><span>Created</span><span>${fmtDate(l.createdDate)}</span></div>
    <div class="detail-section-title">Requirements</div>
    <p style="font-size:13px;color:var(--text-dim);line-height:1.5;">${escapeHtml(l.requirements||'No additional notes provided.')}</p>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();openFormModal('leads','${l.id}')">Edit Lead</button>
    </div>
  `);
}

/* ---------------------------------------------------------------------
   12. CLOSERS VIEW
   --------------------------------------------------------------------- */
function renderClosersView(){
  document.getElementById('view-closers').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Closers <span class="sm">${getAll('closers').length} total</span></div>
        <div class="panel-actions"><button class="btn btn-primary btn-sm" onclick="openFormModal('closers')">+ Add Closer</button></div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search closers…" id="closerSearchInput" oninput="FILTERS.closers.q=this.value;renderClosersTable();"></div>
      </div>
      <div id="closersTableWrap"></div>
    </div>
  `;
  document.getElementById('closerSearchInput').value = FILTERS.closers.q;
  renderClosersTable();
}
function renderClosersTable(){
  const f = FILTERS.closers;
  let rows = getAll('closers').slice();
  if(f.q) rows = rows.filter(c => (c.name+c.whatsapp+(c.email||'')).toLowerCase().includes(f.q.toLowerCase()));
  const wrap = document.getElementById('closersTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('◈','No closers yet','Add your first closer to start assigning leads.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Name</th><th>Contact</th><th>Total Leads</th><th>Closed Deals</th><th>Total Commission</th><th></th>
  </tr></thead><tbody>
    ${rows.map(c=>{
      const st = closerStats(c.id);
      return `<tr>
      <td class="cell-strong">${escapeHtml(c.name)}</td>
      <td><div>${escapeHtml(c.whatsapp)}</div><div class="cell-dim">${escapeHtml(c.email||'')}</div></td>
      <td>${st.totalLeads}</td>
      <td>${st.closedDeals}</td>
      <td class="cell-strong" style="color:var(--green)">${fmtMoney(st.totalCommission)}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-icon" onclick="openFormModal('closers','${c.id}')" title="Edit">✎</button>
        <button class="btn btn-danger btn-icon" onclick="confirmDelete('closers','${c.id}','${escapeHtml(c.name)}')" title="Delete">🗑</button>
      </div></td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}

/* ---------------------------------------------------------------------
   13. DELIVERY PARTNERS VIEW
   --------------------------------------------------------------------- */
function renderDPView(){
  document.getElementById('view-dp').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Delivery Partners <span class="sm">${getAll('deliveryPartners').length} total</span></div>
        <div class="panel-actions"><button class="btn btn-primary btn-sm" onclick="openFormModal('deliveryPartners')">+ Add Delivery Partner</button></div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search delivery partners…" id="dpSearchInput" oninput="FILTERS.dp.q=this.value;renderDPTable();"></div>
      </div>
      <div id="dpTableWrap"></div>
    </div>
  `;
  document.getElementById('dpSearchInput').value = FILTERS.dp.q;
  renderDPTable();
}
function renderDPTable(){
  const f = FILTERS.dp;
  let rows = getAll('deliveryPartners').slice();
  if(f.q) rows = rows.filter(c => (c.name+c.whatsapp+(c.email||'')).toLowerCase().includes(f.q.toLowerCase()));
  const wrap = document.getElementById('dpTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('◇','No delivery partners yet','Add a delivery partner to start assigning projects.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Name</th><th>Contact</th><th>Active Projects</th><th>Total Earnings</th><th></th>
  </tr></thead><tbody>
    ${rows.map(c=>{
      const st = dpStats(c.id);
      return `<tr>
      <td class="cell-strong">${escapeHtml(c.name)}</td>
      <td><div>${escapeHtml(c.whatsapp)}</div><div class="cell-dim">${escapeHtml(c.email||'')}</div></td>
      <td>${st.activeProjects}</td>
      <td class="cell-strong" style="color:var(--green)">${fmtMoney(st.totalEarnings)}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-icon" onclick="openFormModal('deliveryPartners','${c.id}')" title="Edit">✎</button>
        <button class="btn btn-danger btn-icon" onclick="confirmDelete('deliveryPartners','${c.id}','${escapeHtml(c.name)}')" title="Delete">🗑</button>
      </div></td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}

/* ---------------------------------------------------------------------
   14. FREELANCERS VIEW
   --------------------------------------------------------------------- */
function renderFreelancersView(){
  document.getElementById('view-freelancers').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Freelancer Database <span class="sm">${getAll('freelancers').length} total</span></div>
        <div class="panel-actions">
          <button class="btn btn-ghost btn-sm" onclick="exportCSV('freelancers')">⬇ Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="openFormModal('freelancers')">+ Add Freelancer</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search freelancers…" id="flSearchInput" oninput="FILTERS.freelancers.q=this.value;renderFreelancersTable();"></div>
        <select class="filter-select" id="flSkillFilter" onchange="FILTERS.freelancers.skill=this.value;renderFreelancersTable();">
          <option value="">All Skills</option>
          ${SKILLS.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div id="flTableWrap"></div>
    </div>
  `;
  document.getElementById('flSearchInput').value = FILTERS.freelancers.q;
  document.getElementById('flSkillFilter').value = FILTERS.freelancers.skill;
  renderFreelancersTable();
}
function renderFreelancersTable(){
  const f = FILTERS.freelancers;
  let rows = getAll('freelancers').slice();
  if(f.q) rows = rows.filter(c => (c.name+(c.whatsapp||'')+(c.email||'')).toLowerCase().includes(f.q.toLowerCase()));
  if(f.skill) rows = rows.filter(c => c.skill === f.skill);
  const wrap = document.getElementById('flTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('✦','No freelancers found','Build your bench by adding freelancers and their skills.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Name</th><th>Skill</th><th>Rating</th><th>Completed</th><th>Total Earnings</th><th></th>
  </tr></thead><tbody>
    ${rows.map(c=>{
      const st = freelancerStats(c.id);
      return `<tr>
      <td class="cell-strong">${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.skill||'—')}</td>
      <td>★ ${Number(c.rating||5).toFixed(1)}</td>
      <td>${st.completedProjects}</td>
      <td class="cell-strong" style="color:var(--green)">${fmtMoney(st.totalEarnings)}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-icon" onclick="openFormModal('freelancers','${c.id}')" title="Edit">✎</button>
        <button class="btn btn-danger btn-icon" onclick="confirmDelete('freelancers','${c.id}','${escapeHtml(c.name)}')" title="Delete">🗑</button>
      </div></td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}

/* ---------------------------------------------------------------------
   15. PROJECTS VIEW
   --------------------------------------------------------------------- */
function renderProjectsView(){
  document.getElementById('view-projects').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">All Projects <span class="sm">${getAll('projects').length} total</span></div>
        <div class="panel-actions">
          <button class="btn btn-ghost btn-sm" onclick="exportCSV('projects')">⬇ Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="openFormModal('projects')">+ New Project</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search by client, tracking ID…" id="projSearchInput" oninput="FILTERS.projects.q=this.value;renderProjectsTable();"></div>
        <select class="filter-select" id="projStatusFilter" onchange="FILTERS.projects.status=this.value;renderProjectsTable();">
          <option value="">All Statuses</option>
          ${PROJECT_STATUSES.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div id="projectsTableWrap"></div>
    </div>
  `;
  document.getElementById('projSearchInput').value = FILTERS.projects.q;
  document.getElementById('projStatusFilter').value = FILTERS.projects.status;
  renderProjectsTable();
}
function renderProjectsTable(){
  const f = FILTERS.projects;
  let rows = getAll('projects').slice().sort((a,b)=>new Date(b.createdDate)-new Date(a.createdDate));
  if(f.q) rows = rows.filter(p => (p.clientName+p.trackingId).toLowerCase().includes(f.q.toLowerCase()));
  if(f.status) rows = rows.filter(p => p.status === f.status);
  const wrap = document.getElementById('projectsTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('▣','No projects found','Convert a closed lead or create a new project to get started.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Tracking ID</th><th>Client</th><th>Service</th><th>Value</th><th>Profit</th><th>Delivery Partner</th><th>Deadline</th><th>Status</th><th></th>
  </tr></thead><tbody>
    ${rows.map(p=>{
      const fin = computeProjectFinancials(p);
      return `<tr>
      <td class="cell-strong" style="cursor:pointer;color:var(--accent-2)" onclick="openProjectDetails('${p.id}')">${p.trackingId}</td>
      <td class="cell-strong">${escapeHtml(p.clientName)}</td>
      <td>${escapeHtml(p.service||'—')}</td>
      <td>${fmtMoney(fin.total)}</td>
      <td style="color:${fin.agencyProfit>=0?'var(--green)':'var(--red)'}">${fmtMoney(fin.agencyProfit)}</td>
      <td>${escapeHtml(dpName(p.dpId))}</td>
      <td class="cell-dim">${fmtDate(p.deadline)}</td>
      <td><span class="badge ${badgeClassFor(p.status)}">${p.status}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-icon" onclick="openFormModal('projects','${p.id}')" title="Edit">✎</button>
        <button class="btn btn-danger btn-icon" onclick="confirmDelete('projects','${p.id}','${escapeHtml(p.clientName)}')" title="Delete">🗑</button>
      </div></td>
    </tr>`;}).join('')}
  </tbody></table></div>`;
}
function openProjectDetails(id){
  const p = getById('projects', id);
  if(!p) return;
  const fin = computeProjectFinancials(p);
  renderModal(`
    <div class="modal-head"><div class="modal-title">${p.trackingId} — Project Details</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="detail-row"><span>Client</span><span>${escapeHtml(p.clientName)}</span></div>
    <div class="detail-row"><span>Service</span><span>${escapeHtml(p.service||'—')}</span></div>
    <div class="detail-row"><span>Delivery Partner</span><span>${escapeHtml(dpName(p.dpId))}</span></div>
    <div class="detail-row"><span>Freelancer</span><span>${escapeHtml(freelancerName(p.freelancerId))}</span></div>
    <div class="detail-row"><span>Closer</span><span>${escapeHtml(closerName(p.closerId))}</span></div>
    <div class="detail-row"><span>Deadline</span><span>${fmtDate(p.deadline)}</span></div>
    <div class="detail-row"><span>Status</span><span><span class="badge ${badgeClassFor(p.status)}">${p.status}</span></span></div>
    <div style="margin:14px 0 6px;"><div class="progress-track"><div class="progress-fill" style="width:${projectProgressPercent(p.status)}%"></div></div></div>

    <div class="detail-section-title">Financial Breakdown</div>
    <div class="detail-row"><span>Total Project Value</span><span>${fmtMoney(fin.total)}</span></div>
    <div class="detail-row"><span>Freelancer Cost</span><span>− ${fmtMoney(fin.flCost)}</span></div>
    <div class="detail-row"><span>Closer Commission</span><span>− ${fmtMoney(fin.closerComm)}</span></div>
    <div class="detail-row"><span>Delivery Partner Commission</span><span>− ${fmtMoney(fin.dpComm)}</span></div>
    <div class="detail-row" style="border-top:1px solid rgba(255,255,255,0.12);padding-top:10px;"><span style="font-weight:700;color:var(--text)">Agency Profit</span><span style="color:${fin.agencyProfit>=0?'var(--green)':'var(--red)'};font-size:15px;">${fmtMoney(fin.agencyProfit)}</span></div>

    <div class="detail-section-title">Payment Status</div>
    <div class="detail-row"><span>Advance Received</span><span>${fmtMoney(fin.adv)}</span></div>
    <div class="detail-row"><span>Remaining Due</span><span>${fmtMoney(fin.remaining)}</span></div>
    <div class="detail-row"><span>Payment Status</span><span><span class="badge ${badgeClassFor(fin.paymentStatus)}">${fin.paymentStatus}</span></span></div>

    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();openFormModal('projects','${p.id}')">Edit Project</button>
    </div>
  `);
}

/* ---------------------------------------------------------------------
   16. PAYMENTS VIEW
   --------------------------------------------------------------------- */
function renderPaymentsView(){
  const projects = getAll('projects');
  const totalRevenue = projects.reduce((s,p)=>s+(Number(p.totalPrice)||0),0);
  const totalReceived = projects.reduce((s,p)=>s+(Number(p.advancePayment)||0),0);
  const totalDue = totalRevenue - totalReceived;
  document.getElementById('view-payments').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card glass"><div class="ic-badge bg-green">$</div><div class="stat-val">${fmtMoney(totalRevenue)}</div><div class="stat-label">Total Project Value</div></div>
      <div class="stat-card glass"><div class="ic-badge bg-blue">↓</div><div class="stat-val">${fmtMoney(totalReceived)}</div><div class="stat-label">Received</div></div>
      <div class="stat-card glass"><div class="ic-badge bg-red">!</div><div class="stat-val">${fmtMoney(totalDue)}</div><div class="stat-label">Outstanding</div></div>
    </div>
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Payment Tracking</div>
      </div>
      <div class="toolbar">
        <div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="Search client or tracking ID…" id="paySearchInput" oninput="FILTERS.payments.q=this.value;renderPaymentsTable();"></div>
        <select class="filter-select" id="payStatusFilter" onchange="FILTERS.payments.status=this.value;renderPaymentsTable();">
          <option value="">All Payment Statuses</option>
          <option value="Pending">Pending</option><option value="Partial">Partial</option><option value="Paid">Paid</option>
        </select>
      </div>
      <div id="paymentsTableWrap"></div>
    </div>
  `;
  document.getElementById('paySearchInput').value = FILTERS.payments.q;
  document.getElementById('payStatusFilter').value = FILTERS.payments.status;
  renderPaymentsTable();
}
function renderPaymentsTable(){
  const f = FILTERS.payments;
  let rows = getAll('projects').slice().map(p=>({p, fin:computeProjectFinancials(p)}));
  if(f.q) rows = rows.filter(r => (r.p.clientName+r.p.trackingId).toLowerCase().includes(f.q.toLowerCase()));
  if(f.status) rows = rows.filter(r => r.fin.paymentStatus === f.status);
  const wrap = document.getElementById('paymentsTableWrap');
  if(!rows.length){ wrap.innerHTML = emptyState('$','No payment records','Create projects to start tracking payments.'); return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
    <th>Tracking ID</th><th>Client</th><th>Total Value</th><th>Advance</th><th>Remaining</th><th>Status</th><th></th>
  </tr></thead><tbody>
    ${rows.map(({p,fin})=>`<tr>
      <td class="cell-strong">${p.trackingId}</td>
      <td>${escapeHtml(p.clientName)}</td>
      <td>${fmtMoney(fin.total)}</td>
      <td>${fmtMoney(fin.adv)}</td>
      <td style="color:${fin.remaining>0?'var(--red)':'var(--text)'}">${fmtMoney(fin.remaining)}</td>
      <td><span class="badge ${badgeClassFor(fin.paymentStatus)}">${fin.paymentStatus}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="openFormModal('projects','${p.id}')">Update</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

/* ---------------------------------------------------------------------
   17. KANBAN PIPELINE (pure JS drag & drop)
   --------------------------------------------------------------------- */
function projectKanbanCol(p){ return p.status === 'Completed' ? 'Completed' : 'Delivery'; }

function renderKanbanView(){
  const leads = getAll('leads').filter(l => KANBAN_LEAD_COLS.includes(l.status));
  const projects = getAll('projects');
  const columnsHTML = KANBAN_COLS.map(col=>{
    let cards = [];
    if(KANBAN_LEAD_COLS.includes(col)){
      cards = leads.filter(l=>l.status===col).map(l=>kanbanCardHTML('lead', l.id, l.clientName, l.service||''));
    }else{
      cards = projects.filter(p=>projectKanbanCol(p)===col).map(p=>kanbanCardHTML('project', p.id, p.clientName, p.trackingId));
    }
    return `<div class="kanban-col" data-col="${col}" ondragover="onKanbanDragOver(event)" ondragleave="onKanbanDragLeave(event)" ondrop="onKanbanDrop(event,'${col}')">
      <div class="kanban-col-head"><div class="kanban-col-title">${col}</div><div class="kanban-count">${cards.length}</div></div>
      <div class="kanban-cards">${cards.join('')}</div>
    </div>`;
  }).join('');
  document.getElementById('view-kanban').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Pipeline Board</div>
        <div class="panel-actions"><span class="cell-dim" style="font-size:12px;">Drag cards across stages to update status</span></div>
      </div>
      <div class="kanban-board">${columnsHTML}</div>
    </div>`;
}
function kanbanCardHTML(type, id, name, meta){
  const tagStyle = type==='lead' ? 'background:rgba(56,189,248,0.18);color:#7dd3fc;' : 'background:rgba(167,139,250,0.18);color:#c4b5fd;';
  const clickFn = type==='lead' ? 'openLeadDetails' : 'openProjectDetails';
  return `<div class="kanban-card" draggable="true" data-type="${type}" data-id="${id}"
      ondragstart="onKanbanDragStart(event)" ondragend="onKanbanDragEnd(event)" onclick="${clickFn}('${id}')">
    <div class="kc-name">${escapeHtml(name)}</div>
    <div class="kc-meta"><span>${escapeHtml(meta)}</span><span class="kc-tag" style="${tagStyle}">${type}</span></div>
  </div>`;
}
let DRAGGED = null;
function onKanbanDragStart(e){
  DRAGGED = { type: e.target.dataset.type, id: e.target.dataset.id };
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onKanbanDragEnd(e){ e.target.classList.remove('dragging'); }
function onKanbanDragOver(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onKanbanDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function onKanbanDrop(e, col){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if(!DRAGGED) return;
  if(DRAGGED.type === 'lead'){
    if(!KANBAN_LEAD_COLS.includes(col)){
      toast('Convert this lead to a project before moving it to Delivery stages', 'error');
    }else{
      const lead = getById('leads', DRAGGED.id);
      if(lead && lead.status !== col){
        lead.status = col; upsert('leads', lead);
        logActivity('Lead', 'Lead "'+lead.clientName+'" moved to '+col);
        toast('Lead moved to '+col, 'success');
      }
    }
  }else{
    if(!KANBAN_PROJECT_COLS.includes(col)){
      toast('Projects only move between Delivery and Completed here — edit the project for detailed status', 'error');
    }else{
      const proj = getById('projects', DRAGGED.id);
      if(proj){
        const newStatus = col === 'Completed' ? 'Completed' : 'Delivered';
        if(proj.status !== newStatus){
          proj.status = newStatus; upsert('projects', proj);
          logActivity('Project', 'Project '+proj.trackingId+' moved to '+col);
          toast('Project moved to '+col, 'success');
        }
      }
    }
  }
  DRAGGED = null;
  renderKanbanView();
  renderNavBadges();
}

/* ---------------------------------------------------------------------
   18. ANALYTICS — PURE CANVAS CHARTS (no libraries)
   --------------------------------------------------------------------- */
function setupCanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(rect.width,10) * dpr;
  canvas.height = Math.max(rect.height,10) * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}
function lastNMonths(n){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for(let i=n-1;i>=0;i--){
    const dt = new Date(d.getFullYear(), d.getMonth()-i, 1);
    out.push({ key: dt.getFullYear()+'-'+dt.getMonth(), label: dt.toLocaleDateString('en-IN',{month:'short'}) });
  }
  return out;
}
function drawGroupedBars(canvasId, months, seriesA, seriesB, colorA, colorB){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padL = 8, padB = 26, padT = 16, padR = 8;
  const chartW = w - padL - padR, chartH = h - padT - padB;
  const maxVal = Math.max(...seriesA, ...seriesB, 1);
  const groupW = chartW / months.length;
  const barW = Math.min(groupW * 0.32, 22);

  // gridlines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for(let i=0;i<=3;i++){
    const y = padT + chartH - (chartH * i/3);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke();
  }
  months.forEach((m, i) => {
    const cx = padL + groupW * i + groupW/2;
    const valA = seriesA[i], valB = seriesB[i];
    const hA = (valA/maxVal) * chartH;
    const hB = (valB/maxVal) * chartH;
    const grad1 = ctx.createLinearGradient(0, padT+chartH-hA, 0, padT+chartH);
    grad1.addColorStop(0, colorA); grad1.addColorStop(1, 'rgba(124,58,237,0.25)');
    ctx.fillStyle = grad1;
    roundRect(ctx, cx - barW - 3, padT + chartH - hA, barW, hA, 5); ctx.fill();
    const grad2 = ctx.createLinearGradient(0, padT+chartH-hB, 0, padT+chartH);
    grad2.addColorStop(0, colorB); grad2.addColorStop(1, 'rgba(34,197,94,0.25)');
    ctx.fillStyle = grad2;
    roundRect(ctx, cx + 3, padT + chartH - hB, barW, hB, 5); ctx.fill();
    ctx.fillStyle = 'rgba(154,163,184,0.9)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, cx, h - 8);
  });
}
function roundRect(ctx, x, y, w, h, r){
  if(h <= 0) h = 0.001;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function drawHorizontalBars(canvasId, items){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  if(!items.length) return;
  ctx.font = '11.5px sans-serif';
  const labelOffset = Math.min(Math.max(...items.map(i => ctx.measureText(i.label).width)) + 16, w * 0.42);
  const valueColWidth = 44;
  const max = Math.max(...items.map(i=>i.value), 1);
  const rowH = h / items.length;
  items.forEach((item, i) => {
    const barMaxW = Math.max(w - labelOffset - valueColWidth, 10);
    const barW = (item.value/max) * barMaxW;
    const y = i * rowH + rowH*0.22;
    const bh = rowH * 0.56;
    ctx.fillStyle = 'rgba(154,163,184,0.9)';
    ctx.font = '11.5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, 0, y + bh*0.5 + 4);
    const grad = ctx.createLinearGradient(labelOffset, 0, labelOffset+barMaxW, 0);
    grad.addColorStop(0, item.color || '#7c3aed'); grad.addColorStop(1, 'rgba(124,58,237,0.35)');
    ctx.fillStyle = grad;
    roundRect(ctx, labelOffset, y, Math.max(barW,2), bh, 6); ctx.fill();
    ctx.fillStyle = '#eef0f7';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(item.value), labelOffset + Math.max(barW,2) + 8, y + bh*0.5 + 4);
  });
}
function drawDonut(canvasId, segments){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const total = segments.reduce((s,seg)=>s+seg.value,0);
  const cx = w/2, cy = h/2, radius = Math.min(w,h)/2 - 8, inner = radius * 0.6;
  if(total <= 0){
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = radius-inner;
    ctx.beginPath(); ctx.arc(cx,cy,(radius+inner)/2,0,Math.PI*2); ctx.stroke();
    return;
  }
  let start = -Math.PI/2;
  segments.forEach(seg => {
    const angle = (seg.value/total) * Math.PI*2;
    ctx.beginPath();
    ctx.arc(cx, cy, (radius+inner)/2, start, start+angle);
    ctx.lineWidth = radius - inner;
    ctx.strokeStyle = seg.color;
    ctx.stroke();
    start += angle;
  });
  ctx.fillStyle = '#eef0f7';
  ctx.font = '700 18px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(total), cx, cy-6);
  ctx.fillStyle = '#6b7384'; ctx.font = '10px sans-serif';
  ctx.fillText('total', cx, cy+12);
}
function renderAnalyticsView(){
  document.getElementById('view-analytics').innerHTML = `
    <div class="dash-grid2">
      <div class="panel glass chart-card">
        <div class="panel-head"><div class="panel-title">Monthly Revenue vs Profit</div></div>
        <canvas id="chartRevenue" height="220"></canvas>
        <div class="legend-row">
          <span><span class="legend-dot" style="background:#7c3aed"></span>Revenue</span>
          <span><span class="legend-dot" style="background:#22c55e"></span>Profit</span>
        </div>
      </div>
      <div class="panel glass chart-card">
        <div class="panel-head"><div class="panel-title">Lead Conversion Rate</div></div>
        <canvas id="chartConversion" height="220"></canvas>
        <div class="legend-row" id="conversionLegend"></div>
      </div>
    </div>
    <div class="dash-grid2">
      <div class="panel glass chart-card">
        <div class="panel-head"><div class="panel-title">Project Status Breakdown</div></div>
        <canvas id="chartProjectStatus" height="${Math.max(PROJECT_STATUSES.length*34,160)}"></canvas>
      </div>
      <div class="panel glass chart-card">
        <div class="panel-head"><div class="panel-title">Payment Status Breakdown</div></div>
        <canvas id="chartPaymentStatus" height="220"></canvas>
        <div class="legend-row" id="paymentLegend"></div>
      </div>
    </div>
  `;
  requestAnimationFrame(drawAllAnalyticsCharts);
}
function drawAllAnalyticsCharts(){
  const months = lastNMonths(6);
  const projects = getAll('projects');
  const revenueBy = months.map(m => projects.filter(p=>{
    const d = new Date(p.createdDate); return (d.getFullYear()+'-'+d.getMonth()) === m.key;
  }).reduce((s,p)=>s+(Number(p.totalPrice)||0),0));
  const profitBy = months.map(m => projects.filter(p=>{
    const d = new Date(p.createdDate); return (d.getFullYear()+'-'+d.getMonth()) === m.key;
  }).reduce((s,p)=>s+computeProjectFinancials(p).agencyProfit,0));
  drawGroupedBars('chartRevenue', months, revenueBy, profitBy, '#7c3aed', '#22c55e');

  const leads = getAll('leads');
  const closed = leads.filter(l=>l.status==='Closed').length;
  const lost = leads.filter(l=>l.status==='Lost').length;
  const open = leads.length - closed - lost;
  drawDonut('chartConversion', [
    {label:'Closed', value:closed, color:'#22c55e'},
    {label:'Lost', value:lost, color:'#f87171'},
    {label:'Open', value:Math.max(open,0), color:'#38bdf8'}
  ]);
  const rate = leads.length ? Math.round((closed/leads.length)*100) : 0;
  document.getElementById('conversionLegend').innerHTML =
    `<span><span class="legend-dot" style="background:#22c55e"></span>Closed (${closed})</span>
     <span><span class="legend-dot" style="background:#f87171"></span>Lost (${lost})</span>
     <span><span class="legend-dot" style="background:#38bdf8"></span>Open (${Math.max(open,0)})</span>
     <span style="margin-left:auto;font-weight:700;color:var(--text)">${rate}% conversion</span>`;

  const statusCounts = PROJECT_STATUSES.map(st => ({label:st, value:projects.filter(p=>p.status===st).length, color:'#7c3aed'}));
  drawHorizontalBars('chartProjectStatus', statusCounts);

  const fins = projects.map(computeProjectFinancials);
  const pending = fins.filter(f=>f.paymentStatus==='Pending').length;
  const partial = fins.filter(f=>f.paymentStatus==='Partial').length;
  const paid = fins.filter(f=>f.paymentStatus==='Paid').length;
  drawDonut('chartPaymentStatus', [
    {label:'Pending', value:pending, color:'#f87171'},
    {label:'Partial', value:partial, color:'#fbbf24'},
    {label:'Paid', value:paid, color:'#22c55e'}
  ]);
  document.getElementById('paymentLegend').innerHTML =
    `<span><span class="legend-dot" style="background:#f87171"></span>Pending (${pending})</span>
     <span><span class="legend-dot" style="background:#fbbf24"></span>Partial (${partial})</span>
     <span><span class="legend-dot" style="background:#22c55e"></span>Paid (${paid})</span>`;
}
window.addEventListener('resize', debounce(()=>{
  if(document.getElementById('view-analytics').classList.contains('active')) drawAllAnalyticsCharts();
}, 250));

/* ---------------------------------------------------------------------
   19. ACTIVITY LOG VIEW
   --------------------------------------------------------------------- */
function renderActivityView(){
  const acts = getAll('activities');
  document.getElementById('view-activity').innerHTML = `
    <div class="panel glass">
      <div class="panel-head">
        <div class="panel-title">Activity Log <span class="sm">Last ${acts.length} of 100 max</span></div>
      </div>
      ${acts.length ? acts.map(a=>activityItemHTML(a)).join('') : emptyState('≡','No activity recorded yet','Every action you take across ELITHNIC will be logged here.')}
    </div>`;
}

/* ---------------------------------------------------------------------
   20. NOTIFICATIONS PANEL
   --------------------------------------------------------------------- */
function renderNotifDot(){
  const unread = getAll('notifications').filter(n=>!n.read).length;
  document.getElementById('notifDot').style.display = unread ? 'block' : 'none';
}
function toggleNotifPanel(){
  const panel = document.getElementById('notifPanel');
  const show = !panel.classList.contains('show');
  panel.classList.toggle('show', show);
  if(show){
    const notifs = getAll('notifications');
    panel.innerHTML = notifs.length ? notifs.slice(0,20).map(n=>`
      <div class="notif-item ${n.read?'':'unread'}" onclick="markNotifRead('${n.id}')">
        <div class="ni-msg">${escapeHtml(n.message)}</div>
        <div class="ni-time">${fmtDateTime(n.timestamp)}</div>
      </div>`).join('') : '<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:12.5px;">No notifications yet</div>';
    notifs.forEach(n=>n.read=true);
    saveDB();
  }
  renderNotifDot();
}
function markNotifRead(id){
  const n = getAll('notifications').find(x=>x.id===id);
  if(n){ n.read = true; saveDB(); }
}
function checkDeadlineReminders(){
  const projects = getAll('projects').filter(p=>p.status!=='Completed' && p.deadline);
  projects.forEach(p=>{
    const days = daysBetween(todayISO(), p.deadline);
    const flagKey = '_deadlineNotified_'+p.id;
    if(days <= 2 && days >= 0 && !DB.meta[flagKey]){
      pushNotification('Deadline approaching for '+p.clientName+' ('+p.trackingId+') — '+(days===0?'today':days+' day(s) left'), 'deadline');
      DB.meta[flagKey] = true;
    }
  });
  saveDB();
}

/* ---------------------------------------------------------------------
   21. EXPORT (CSV)
   --------------------------------------------------------------------- */
function toCSVValue(v){
  if(v === undefined || v === null) v = '';
  v = String(v).replace(/"/g,'""');
  return '"'+v+'"';
}
function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type: mime||'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 300);
}
function exportCSV(entityKey){
  let rows = [], headers = [];
  if(entityKey === 'leads'){
    headers = ['Lead ID','Client Name','WhatsApp','Email','Service','Budget','Requirements','Assigned Closer','Status','Created Date'];
    rows = getAll('leads').map(l => [l.id,l.clientName,l.whatsapp,l.email,l.service,l.budget,l.requirements,closerName(l.assignedCloserId),l.status,l.createdDate]);
  }else if(entityKey === 'projects'){
    headers = ['Tracking ID','Client Name','Service','Total Price','Advance','Remaining','Freelancer Cost','Closer Commission','DP Commission','Agency Profit','Delivery Partner','Freelancer','Deadline','Status','Payment Status'];
    rows = getAll('projects').map(p => { const f = computeProjectFinancials(p); return [p.trackingId,p.clientName,p.service,f.total,f.adv,f.remaining,f.flCost,f.closerComm,f.dpComm,f.agencyProfit,dpName(p.dpId),freelancerName(p.freelancerId),p.deadline,p.status,f.paymentStatus]; });
  }else if(entityKey === 'freelancers'){
    headers = ['Name','Skill','WhatsApp','Email','Rating','Completed Projects','Total Earnings'];
    rows = getAll('freelancers').map(f => { const s = freelancerStats(f.id); return [f.name,f.skill,f.whatsapp,f.email,f.rating,s.completedProjects,s.totalEarnings]; });
  }
  const csv = [headers.map(toCSVValue).join(',')].concat(rows.map(r=>r.map(toCSVValue).join(','))).join('\n');
  downloadFile('elithnic_'+entityKey+'_'+todayISO()+'.csv', csv, 'text/csv');
  toast(entityKey.charAt(0).toUpperCase()+entityKey.slice(1)+' exported as CSV', 'success');
  logActivity('System', entityKey.charAt(0).toUpperCase()+entityKey.slice(1)+' exported to CSV');
}

/* ---------------------------------------------------------------------
   22. BACKUP & RESTORE
   --------------------------------------------------------------------- */
function backupJSON(){
  downloadFile('elithnic_backup_'+todayISO()+'.json', JSON.stringify(DB, null, 2), 'application/json');
  toast('Backup downloaded successfully', 'success');
  logActivity('System', 'Full database backup exported');
}
function triggerImport(){ document.getElementById('importFileInput').click(); }
function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!parsed || typeof parsed !== 'object' || !('leads' in parsed)) throw new Error('Invalid file structure');
      renderModal(`
        <div class="modal-head"><div class="modal-title">Restore Backup?</div><button class="modal-close" onclick="closeModal()">✕</button></div>
        <p style="font-size:13.5px;color:var(--text-dim);line-height:1.5;">This will <strong style="color:var(--red)">replace all current data</strong> with the contents of this backup file. This cannot be undone.</p>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-danger" onclick="doRestore()">Restore Backup</button>
        </div>`);
      window._pendingRestore = parsed;
    }catch(err){
      toast('Invalid backup file', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
function doRestore(){
  DB = window._pendingRestore;
  saveDB();
  closeModal();
  toast('Database restored from backup', 'success');
  logActivity('System', 'Database restored from backup file');
  renderAll();
}
function resetDatabase(){
  renderModal(`
    <div class="modal-head"><div class="modal-title">Reset Entire Database?</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <p style="font-size:13.5px;color:var(--text-dim);line-height:1.5;">This will permanently delete <strong style="color:var(--red)">all leads, projects, team members and history</strong>. Your admin password will be kept. This cannot be undone.</p>
    <div class="field"><label>Type RESET to confirm</label><input type="text" id="resetConfirmInput" placeholder="RESET"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doResetDatabase()">Reset Database</button>
    </div>`);
}
function doResetDatabase(){
  const val = document.getElementById('resetConfirmInput').value.trim();
  if(val !== 'RESET'){ toast('Please type RESET to confirm', 'error'); return; }
  const authBackup = DB.auth;
  DB = defaultDB();
  DB.auth = authBackup;
  saveDB();
  closeModal();
  toast('Database reset successfully', 'success');
  logActivity('System', 'Entire database was reset');
  renderAll();
}
function renderBackupView(){
  document.getElementById('view-backup').innerHTML = `
    <div class="panel glass">
      <div class="panel-head"><div class="panel-title">Export Reports</div></div>
      <div class="settings-row"><div><div class="s-title">Leads CSV</div><div class="s-sub">Export all lead records as a spreadsheet-ready CSV file</div></div><button class="btn btn-ghost btn-sm" onclick="exportCSV('leads')">⬇ Export</button></div>
      <div class="settings-row"><div><div class="s-title">Projects CSV</div><div class="s-sub">Export all project and financial data as CSV</div></div><button class="btn btn-ghost btn-sm" onclick="exportCSV('projects')">⬇ Export</button></div>
      <div class="settings-row"><div><div class="s-title">Freelancers CSV</div><div class="s-sub">Export your freelancer database as CSV</div></div><button class="btn btn-ghost btn-sm" onclick="exportCSV('freelancers')">⬇ Export</button></div>
    </div>
    <div class="panel glass">
      <div class="panel-head"><div class="panel-title">Backup &amp; Restore</div></div>
      <div class="settings-row"><div><div class="s-title">Backup Database</div><div class="s-sub">Download a complete JSON snapshot of every record in ELITHNIC</div></div><button class="btn btn-ghost btn-sm" onclick="backupJSON()">⬇ Download Backup</button></div>
      <div class="settings-row"><div><div class="s-title">Import / Restore Backup</div><div class="s-sub">Restore your workspace from a previously exported JSON backup</div></div><button class="btn btn-ghost btn-sm" onclick="triggerImport()">⬆ Import Backup</button></div>
      <div class="settings-row"><div><div class="s-title">Reset Entire Database</div><div class="s-sub">Permanently erase all data and start fresh</div></div><button class="btn btn-danger btn-sm" onclick="resetDatabase()">Reset Database</button></div>
    </div>
    <input type="file" id="importFileInput" accept="application/json" class="hidden" onchange="handleImportFile(event)">
  `;
}

/* ---------------------------------------------------------------------
   23. SETTINGS VIEW
   --------------------------------------------------------------------- */
function renderSettingsView(){
  document.getElementById('view-settings').innerHTML = `
    <div class="panel glass">
      <div class="panel-head"><div class="panel-title">Change Password</div></div>
      <div class="field"><label>Current Password</label><input type="password" id="settingsCurPass"></div>
      <div class="form-grid2">
        <div class="field"><label>New Password</label><input type="password" id="settingsNewPass"></div>
        <div class="field"><label>Confirm New Password</label><input type="password" id="settingsConfirmPass"></div>
      </div>
      <button class="btn btn-primary" onclick="handleChangePassword()">Update Password</button>
    </div>
    <div class="panel glass">
      <div class="panel-head"><div class="panel-title">Recovery Key</div></div>
      <p style="font-size:13px;color:var(--text-dim);line-height:1.5;">Your recovery key lets you reset your password if you ever forget it. Anyone shown this key earlier should keep it safe — for security it isn't displayed again here.</p>
      <button class="btn btn-ghost btn-sm" onclick="regenerateRecoveryKey()">Generate New Recovery Key</button>
    </div>
    <div class="panel glass">
      <div class="panel-head"><div class="panel-title">Workspace</div></div>
      <div class="settings-row"><div><div class="s-title">Agency</div><div class="s-sub">ELITHNIC — Outsourcing &amp; Delivery Platform</div></div></div>
      <div class="settings-row"><div><div class="s-title">Data Storage</div><div class="s-sub">All data is stored locally in this browser via localStorage</div></div></div>
      <div class="settings-row"><div><div class="s-title">Quick Actions</div><div class="s-sub">Manage backups and data resets</div></div><button class="btn btn-ghost btn-sm" onclick="navigateTo('backup')">Go to Backup &amp; Export</button></div>
    </div>
  `;
}
function regenerateRecoveryKey(){
  const newKey = randomRecoveryKey();
  sha256(newKey).then(hash=>{
    DB.auth.recoveryKeyHash = hash;
    saveDB();
    renderModal(`
      <div class="modal-head"><div class="modal-title">New Recovery Key</div><button class="modal-close" onclick="closeModal()">✕</button></div>
      <p style="font-size:13px;color:var(--text-dim);">Save this key somewhere safe. Your previous recovery key is no longer valid.</p>
      <div class="recovery-box">${newKey}</div>
      <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal()">I've saved it</button></div>
    `);
    logActivity('Settings', 'A new recovery key was generated');
  });
}

/* ---------------------------------------------------------------------
   24. CLIENT TRACKING (public, no login required)
   --------------------------------------------------------------------- */
function handleTrackLookup(){
  const idRaw = document.getElementById('trackInput').value.trim().toUpperCase();
  const box = document.getElementById('trackResultBox');
  const id = idRaw.startsWith('ELI-') ? idRaw : 'ELI-'+idRaw.replace(/[^0-9]/g,'');
  const project = getAll('projects').find(p => p.trackingId.toUpperCase() === id);
  if(!project){
    box.classList.remove('hidden');
    box.innerHTML = `<div class="empty-state"><div class="ic">⚠</div><div class="t">Tracking ID not found</div><div class="s">Double-check the ID shared by your account manager and try again.</div></div>`;
    return;
  }
  const fin = computeProjectFinancials(project);
  const pct = projectProgressPercent(project.status);
  const idx = PROJECT_STATUSES.indexOf(project.status);
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="detail-row"><span>Client</span><span>${escapeHtml(project.clientName)}</span></div>
    <div class="detail-row"><span>Service</span><span>${escapeHtml(project.service||'—')}</span></div>
    <div class="detail-row"><span>Deadline</span><span>${fmtDate(project.deadline)}</span></div>
    <div class="detail-row"><span>Payment Status</span><span><span class="badge ${badgeClassFor(fin.paymentStatus)}">${fin.paymentStatus}</span></span></div>
    <div style="margin:16px 0 4px;font-size:12px;color:var(--text-dim);">Progress — ${pct}%</div>
    <div class="progress-track" style="margin-bottom:16px;"><div class="progress-fill" style="width:${pct}%"></div></div>
    ${PROJECT_STATUSES.map((st,i)=>`
      <div class="track-step">
        <div class="track-dot ${i<idx?'done':(i===idx?'active':'')}">${i<idx?'✓':(i+1)}</div>
        <div style="font-size:13px;font-weight:${i===idx?'700':'500'};color:${i<=idx?'var(--text)':'var(--text-faint)'}">${st}</div>
      </div>
      ${i<PROJECT_STATUSES.length-1 ? `<div style="margin-left:11px;"><div class="track-line ${i<idx?'done':''}" style="height:14px;width:2px;"></div></div>` : ''}
    `).join('')}
  `;
}

/* ---------------------------------------------------------------------
   25. RENDER MAP + GLOBAL REFRESH
   --------------------------------------------------------------------- */
let CURRENT_VIEW = 'dashboard';
const RENDER_MAP = {
  dashboard: renderDashboard,
  kanban: renderKanbanView,
  leads: renderLeadsView,
  closers: renderClosersView,
  projects: renderProjectsView,
  dp: renderDPView,
  freelancers: renderFreelancersView,
  payments: renderPaymentsView,
  analytics: renderAnalyticsView,
  activity: renderActivityView,
  backup: renderBackupView,
  settings: renderSettingsView
};
function renderAll(){
  renderNavBadges();
  checkDeadlineReminders();
  renderNotifDot();
  const active = document.querySelector('.nav-item.active');
  const view = active ? active.dataset.view : 'dashboard';
  if(RENDER_MAP[view]) RENDER_MAP[view]();
}

/* ---------------------------------------------------------------------
   26. EVENT BINDINGS + BOOTSTRAP
   --------------------------------------------------------------------- */
function wireStaticEvents(){
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('loginPassword').addEventListener('keydown', e => { if(e.key === 'Enter') handleLogin(); });
  document.getElementById('forgotPassLink').addEventListener('click', () => showScreen('forgotScreen'));
  document.getElementById('backToLoginLink').addEventListener('click', () => showScreen('loginScreen'));
  document.getElementById('forgotResetBtn').addEventListener('click', handleForgotReset);
  document.getElementById('trackLinkFromLogin').addEventListener('click', () => showScreen('trackScreen'));
  document.getElementById('backToLoginFromTrack').addEventListener('click', () => showScreen('loginScreen'));
  document.getElementById('trackBtn').addEventListener('click', handleTrackLookup);
  document.getElementById('trackInput').addEventListener('keydown', e => { if(e.key === 'Enter') handleTrackLookup(); });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebarMobile);
  document.getElementById('notifBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleNotifPanel(); });
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    if(panel.classList.contains('show') && !panel.contains(e.target) && e.target.id !== 'notifBtn') panel.classList.remove('show');
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { CURRENT_VIEW = item.dataset.view; navigateTo(item.dataset.view); });
  });
}

async function bootstrap(){
  loadDB();
  const firstRunKey = await ensureDefaultAuth();
  wireStaticEvents();

  setTimeout(async () => {
    if(isLoggedIn()){
      showApp();
    }else{
      showScreen('loginScreen');
    }
    if(firstRunKey){
      renderModal(`
        <div class="modal-head"><div class="modal-title">Welcome to ELITHNIC</div><button class="modal-close" onclick="closeModal()">✕</button></div>
        <p style="font-size:13.5px;color:var(--text-dim);line-height:1.5;">Your workspace is ready. Save this recovery key — you'll need it if you ever forget your admin password. It will not be shown again.</p>
        <div class="recovery-box">${firstRunKey}</div>
        <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal()">I've saved my recovery key</button></div>
      `);
    }
  }, 900);
}
document.addEventListener('DOMContentLoaded', bootstrap);
</script>
</body>
</html>
