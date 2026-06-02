import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileDown, Scissors, Edit3, Home, Lock, Unlock } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const menuItems = [
    { path: '/', name: 'ホーム', icon: <Home size={20} /> },
    { path: '/merge', name: 'PDF結合', icon: <FileDown size={20} /> },
    { path: '/split', name: 'PDF分割', icon: <Scissors size={20} /> },
    { path: '/editor', name: 'PDF編集', icon: <Edit3 size={20} /> },
    { path: '/protect', name: 'パスワード保護', icon: <Lock size={20} /> },
    { path: '/unlock', name: 'パスワード解除', icon: <Unlock size={20} /> },
  ];

  return (
    <aside className="sidebar glass-panel">
      <div className="sidebar-header">
        <div className="logo-icon">PDF</div>
        <h2>MagicTools</h2>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({isActive}) => isActive ? "nav-item active" : "nav-item"}
          >
            {item.icon}
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <p>ローカル・セキュア処理</p>
      </div>
    </aside>
  );
}
