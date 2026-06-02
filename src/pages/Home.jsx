import React from 'react';
import { Link } from 'react-router-dom';
import { FileDown, Scissors, Edit3, Lock, Unlock } from 'lucide-react';
import './Home.css';

export default function Home() {
  const tools = [
    {
      title: 'PDF結合',
      description: '複数のPDFファイルを、素早く安全に1つのドキュメントにまとめます。',
      icon: <FileDown size={32} />,
      path: '/merge',
      color: 'from-purple-500 to-indigo-500'
    },
    {
      title: 'PDF分割',
      description: '必要なページ範囲だけを抽出して、新しいPDFファイルを作成します。',
      icon: <Scissors size={32} />,
      path: '/split',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'PDF編集',
      description: 'ブラウザ上で直接、PDFにテキストや図形を追加・編集できます。',
      icon: <Edit3 size={32} />,
      path: '/editor',
      color: 'from-pink-500 to-rose-500'
    },
    {
      title: 'パスワード保護',
      description: 'PDFにパスワードをかけて、第三者による閲覧を防止します。',
      icon: <Lock size={32} />,
      path: '/protect',
      color: 'from-emerald-500 to-teal-500'
    },
    {
      title: 'パスワード解除',
      description: 'パスワードで保護されたPDFのロックを解除し、パスワードなしで保存します。',
      icon: <Unlock size={32} />,
      path: '/unlock',
      color: 'from-amber-500 to-orange-500'
    }
  ];

  return (
    <div className="home-container">
      <div className="hero-section text-center">
        <h1>PDFに必要なすべてのツールをここに</h1>
        <p>100%無料、安全、そしてローカル完結。サーバーにアップロードすることなく、ブラウザ上ですぐに処理できます。</p>
      </div>

      <div className="tools-grid">
        {tools.map((tool, index) => (
          <Link to={tool.path} key={index} className="tool-card glass-panel">
            <div className="tool-icon">
              {tool.icon}
            </div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
