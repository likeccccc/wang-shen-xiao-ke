// 页面信息抓取【迁移核心】：自包含 IIFE、零 chrome.* 依赖。
// 由 chrome.scripting.executeScript({files}) 注入，最后一个表达式的值即注入结果。
// 四层 fallback：SITE_RULES 规则表 → og meta → title 拆分 → h1/hostname 兜底，
// confidence 记录每个字段的取值来源（site-rule / og / title / fallback / hostname / none）。
(() => {
  const hostname = location.hostname.toLowerCase();

  // ---------- 工具 ----------
  const text = (selectors) => {
    for (const sel of selectors.split(',')) {
      let el;
      try { el = document.querySelector(sel.trim()); } catch { continue; }
      const t = el && el.textContent && el.textContent.trim().replace(/\s+/g, ' ');
      if (t) return t.slice(0, 60);
    }
    return '';
  };

  const og = (prop) => {
    const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
    return ((el && el.getAttribute('content')) || '').trim();
  };

  const genericPosition = () => text(
    'h1, [class*="job-title"], [class*="jobTitle"], [class*="job-name"], [class*="jobName"], ' +
    '[class*="position-name"], [class*="positionName"], [class*="position-title"], [class*="job_name"], ' +
    '[class*="post-title"], [class*="postTitle"]'
  );

  // 通用公司名提取（各平台常见的公司名选择器）
  const genericCompany = () => text(
    '[class*="company-name"], [class*="companyName"], [class*="company_info"], ' +
    '[class*="employer-name"], [class*="employerName"], [class*="org-name"], ' +
    '.cname, .com-name, .firm-name'
  );

  // ---------- 第 3 层：标题拆分（第 1/2 层规则也会复用） ----------
  const RECRUIT_WORDS = /校园招聘|社会招聘|招聘|校招|社招|人才|加入我们|诚聘|Careers?|Jobs?|Recruit(?:ing|ment)?|Hiring|Join\s?Us/i;

  function splitSegments(str) {
    return (str || '').split(/\s*[|｜\-–—_·»【】]\s*/).map(s => s.trim()).filter(Boolean);
  }

  // 含招聘关键词的段，剥掉关键词后作为公司名（招聘站 title 惯例："岗位名-公司招聘"）
  function titleCompany(str) {
    for (const seg of splitSegments(str === undefined ? document.title : str)) {
      if (RECRUIT_WORDS.test(seg)) {
        const cleaned = seg
          .replace(new RegExp(RECRUIT_WORDS.source, 'gi'), '')
          .replace(/官网|首页|网站/g, '')
          .trim();
        if (cleaned) return cleaned.slice(0, 30);
      }
    }
    return '';
  }

  // 不含招聘关键词的最长段作为岗位名
  function titlePosition(str) {
    const segs = splitSegments(str === undefined ? document.title : str)
      .filter(s => !RECRUIT_WORDS.test(s));
    if (!segs.length) return '';
    return segs.sort((a, b) => b.length - a.length)[0].slice(0, 60);
  }

  // ---------- 第 4 层：hostname 兜底取公司 ----------
  function hostnameCompany() {
    const GENERIC = new Set([
      'www', 'careers', 'career', 'jobs', 'job', 'talent', 'talents', 'hr',
      'join', 'campus', 'zhaopin', 'recruit', 'recruitment', 'hire', 'hiring',
      'app', 'm', 'wap', 'apply'
    ]);
    const TLD = new Set(['com', 'cn', 'net', 'org', 'io', 'co', 'hk', 'tw', 'jp', 'us', 'ai', 'dev']);
    const core = hostname.split('.').filter(p => !GENERIC.has(p) && !TLD.has(p));
    return core.length ? core[core.length - 1] : hostname;
  }

  // ---------- 第 1 层：站点规则表（最高置信度） ----------
  // company/position 可为静态字符串或函数 (hostname) => string。
  // 贡献规则：加一条即可，无需改动下方提取引擎。
  const SITE_RULES = [
    // ════════════════════════════════════════════════════════════
    // 一、中国主流招聘平台
    // ════════════════════════════════════════════════════════════
    { match: h => h === 'www.zhipin.com' || h.endsWith('.zhipin.com'), // BOSS直聘
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.name, .job-name, .job_title, h1') || genericPosition() },
    { match: h => h.includes('zhaopin.com') && !h.includes('zhaopin.meituan'), // 智联招聘
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.job-name, .position-title, .post-title, h1') || genericPosition() },
    { match: h => h.endsWith('51job.com') || h.includes('51job'), // 前程无忧
      company: () => genericCompany() || text('.cname, .company-name') || og('og:site_name') || titleCompany(),
      position: () => text('.t1, .job-name, .zwmc, h1') || genericPosition() },
    { match: h => h === 'www.liepin.com' || h.endsWith('.liepin.com'), // 猎聘
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.job-title, .title-info, .name, h1') || genericPosition() },
    { match: h => h === 'www.lagou.com' || h.endsWith('.lagou.com'), // 拉勾
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.job-name, .position-content, .job-title, h1') || genericPosition() },
    { match: h => h === 'www.nowcoder.com' || h.endsWith('.nowcoder.com'), // 牛客
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('.job-name, .post-title, .discuss-title, h1') || genericPosition() },
    { match: h => h === 'www.shixiseng.com' || h.endsWith('.shixiseng.com'), // 实习僧
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.job-name, .job_title, h1') || genericPosition() },
    { match: h => h === 'maimai.cn' || h.endsWith('.maimai.cn'), // 脉脉
      company: () => genericCompany() || og('og:site_name') || titleCompany(),
      position: () => text('.job-name, .job-title, .position-title, h1') || genericPosition() },

    // ════════════════════════════════════════════════════════════
    // 二、大厂自建官网
    // ════════════════════════════════════════════════════════════
    { match: h => h === 'careers.tencent.com', company: '腾讯',
      position: () => text('.job-detail-title, h1') || genericPosition() },
    { match: h => h === 'join.qq.com', company: '腾讯', position: genericPosition },
    { match: h => h === 'talent.alibaba.com', company: '阿里巴巴', position: genericPosition },
    { match: h => h === 'jobs.bytedance.com', company: '字节跳动',
      position: () => text('h1, [class*="postTitle"]') || genericPosition() },
    { match: h => h === 'careers.jd.com' || h === 'zhaopin.jd.com', company: '京东', position: genericPosition },
    { match: h => h === 'zhaopin.meituan.com', company: '美团', position: genericPosition },
    { match: h => h === 'talent.baidu.com', company: '百度', position: genericPosition },
    { match: h => h === 'careers.pinduoduo.com', company: '拼多多', position: genericPosition },
    { match: h => h.endsWith('.xiaohongshu.com') && /job|career|talent/.test(h), company: '小红书', position: genericPosition },
    { match: h => h === 'hr.163.com' || h === 'campus.163.com', company: '网易', position: genericPosition },
    { match: h => h === 'career.huawei.com' || h === 'career.huawei.cn', // 华为
      company: '华为',
      position: () => text('.job-title, .post-title, .post-name, h1') || genericPosition() },
    { match: h => h.endsWith('.xiaomi.com') && /career|job|zhaopin/.test(h), // 小米
      company: '小米',
      position: () => text('.job-title, .position-title, h1') || genericPosition() },
    { match: h => h.endsWith('.kuaishou.com') && /campus|career|job|zhaopin/.test(h), // 快手
      company: '快手',
      position: () => text('.job-title, .position-title, h1') || genericPosition() },
    { match: h => h === 'talent.didiglobal.com' || h.includes('didi'), // 滴滴
      company: '滴滴',
      position: () => text('.job-title, .position-name, h1') || genericPosition() },
    { match: h => h.endsWith('.antgroup.com') && /career|job|talent/.test(h), // 蚂蚁集团
      company: '蚂蚁集团',
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.endsWith('.bilibili.com') && /career|job|talent/.test(h), // 哔哩哔哩
      company: '哔哩哔哩',
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.endsWith('.ctrip.com') && /career|job|talent/.test(h), // 携程
      company: '携程',
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.endsWith('.mihoyo.com') || h.endsWith('.hoyoverse.com'), // 米哈游
      company: '米哈游',
      position: () => text('.job-title, .position-title, h1') || genericPosition() },
    { match: h => h.endsWith('.sankuai.com'), // 美团技术
      company: '美团', position: genericPosition },
    { match: h => h.endsWith('.bytedance.net') || h.endsWith('.bytedance.com'), // 字节其他子域名
      company: '字节跳动', position: genericPosition },

    // ════════════════════════════════════════════════════════════
    // 三、新能源车企
    // ════════════════════════════════════════════════════════════
    { match: h => h.endsWith('.nio.com') && /career|job|talent/.test(h), // 蔚来
      company: '蔚来',
      position: () => text('.job-title, .position-name, h1') || genericPosition() },
    { match: h => h.endsWith('.lixiang.com') || h.endsWith('.chehejia.com'), // 理想汽车
      company: '理想汽车',
      position: () => text('.job-title, .position-name, h1') || genericPosition() },
    { match: h => h.endsWith('.xiaopeng.com') && /career|job|talent/.test(h), // 小鹏
      company: '小鹏汽车',
      position: () => text('.job-title, .position-name, h1') || genericPosition() },
    { match: h => h.endsWith('.byd.com') && /career|job|talent/.test(h), // 比亚迪
      company: '比亚迪',
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.endsWith('.zeekrlife.com') || (h.endsWith('.geely.com') && /career|job/.test(h)), // 极氪/吉利
      company: () => h.includes('zeekr') ? '极氪' : '吉利',
      position: genericPosition },

    // ════════════════════════════════════════════════════════════
    // 四、全球招聘平台
    // ════════════════════════════════════════════════════════════
    { match: h => h === 'www.linkedin.com' || h.endsWith('.linkedin.com'), // LinkedIn
      company: () => text('.topcard__org-name-link, .company-name, .employer-name') ||
        og('og:site_name') || titleCompany(),
      position: () => text('.topcard__title, .job-title, h1') || genericPosition() },
    { match: h => h.includes('indeed.com'), // Indeed
      company: () => text('[class*="companyName"], [class*="company-name"], [class*="employer"]') ||
        og('og:site_name') || titleCompany(),
      position: () => text('[class*="jobTitle"], [class*="job-title"], h1') || genericPosition() },
    { match: h => h === 'www.glassdoor.com' || h.endsWith('.glassdoor.com'), // Glassdoor
      company: () => text('.employer-name, .company-name, [class*="employerName"]') ||
        og('og:site_name') || titleCompany(),
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.includes('monster.com'), // Monster
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('.job-title, h1') || genericPosition() },
    { match: h => h.includes('ziprecruiter.com'), // ZipRecruiter
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('.job-title, h1') || genericPosition() },

    // ════════════════════════════════════════════════════════════
    // 五、招聘 SaaS 系统（一条规则覆盖数百家公司）
    // ════════════════════════════════════════════════════════════
    { match: h => h.endsWith('.mokahr.com'), // Moka
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="jobTitle"], [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.beisen.com') || h.includes('hotjob'), // 北森
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, .job-name, [class*="positionName"]') || genericPosition() },
    { match: h => h.endsWith('.dayee.com'), // 用友大易
      company: () => og('og:site_name') || titleCompany(),
      position: genericPosition },
    { match: h => h.endsWith('.myworkdayjobs.com'), // Workday：公司名即子域名
      company: h => h.split('.')[0],
      position: () => text('h1[data-automation-id="jobPostingHeader"], h1') },
    { match: h => h.includes('.successfactors.'), // SAP SuccessFactors
      company: () => og('og:site_name') || titleCompany(),
      position: genericPosition },
    { match: h => h.endsWith('.greenhouse.io'),
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1.app-title, h1') },
    { match: h => h.endsWith('.lever.co'), // jobs.lever.co/<company>/...
      company: () => og('og:site_name') || titleCompany() ||
        (location.pathname.split('/').filter(Boolean)[0] || ''),
      position: () => text('.posting-headline h2, h2, h1') },
    { match: h => h.endsWith('.smartrecruiters.com'), // SmartRecruiters
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"], [class*="jobTitle"]') || genericPosition() },
    { match: h => h.endsWith('.jobvite.com'), // Jobvite
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.taleo.net'), // Oracle Taleo
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"], .title') || genericPosition() },
    { match: h => h.endsWith('.icims.com'), // iCIMS
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.ashbyhq.com'), // Ashby
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.breezy.hr'), // Breezy HR
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.recruitee.com'), // Recruitee
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.pinpointhq.com'), // Pinpoint
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.teamtailor.com'), // Teamtailor
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.workable.com'), // Workable
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.bamboohr.com'), // BambooHR
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() },
    { match: h => h.endsWith('.applytojob.com'), // ApplyToJob
      company: () => og('og:site_name') || titleCompany(),
      position: () => text('h1, [class*="job-title"]') || genericPosition() }
  ];

  // ---------- 主流程：逐层 fallback，记录置信度 ----------
  let company = '';
  let position = '';
  const confidence = { company: 'none', position: 'none' };

  const rule = SITE_RULES.find(r => { try { return r.match(hostname); } catch { return false; } });
  if (rule) {
    try {
      company = typeof rule.company === 'function' ? rule.company(hostname) : rule.company;
      if (company) confidence.company = 'site-rule';
    } catch { /* 规则失败继续走下层 */ }
    try {
      position = typeof rule.position === 'function' ? rule.position(hostname) : rule.position;
      if (position) confidence.position = 'site-rule';
    } catch { /* 同上 */ }
  }

  // 第 2 层：Open Graph meta
  if (!company) {
    company = og('og:site_name').slice(0, 30);
    if (company) confidence.company = 'og';
  }
  if (!position) {
    const ogTitle = og('og:title');
    if (ogTitle) {
      position = /[|｜\-–—_·»]/.test(ogTitle) ? titlePosition(ogTitle) : ogTitle.slice(0, 60);
      if (position) confidence.position = 'og';
    }
  }

  // 第 3 层：document.title 拆分
  if (!company) {
    company = titleCompany();
    if (company) confidence.company = 'title';
  }
  if (!position) {
    position = titlePosition();
    if (position) confidence.position = 'title';
  }

  // 第 4 层：兜底（低置信度，侧边栏中高亮提醒核对）
  if (!position) {
    position = genericPosition();
    if (position) confidence.position = 'fallback';
  }
  if (!company) {
    company = hostnameCompany();
    if (company) confidence.company = 'hostname';
  }

  return {
    company,
    position,
    url: location.href,
    pageTitle: document.title,
    confidence
  };
})();