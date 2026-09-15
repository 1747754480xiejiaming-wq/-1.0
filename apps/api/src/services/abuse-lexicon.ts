export interface AbuseLexiconCandidate {question:string;keywords:string[]}

// Manually reviewed, multi-character candidates for person-directed abuse.
// The taxonomy follows THU-CoAI COLDataset (Apache-2.0), while common spelling
// variants were cross-checked against Sensitive-lexicon (MIT). No COLDataset
// comment/sample text is redistributed here. Keep imports disabled until a
// teacher reviews and explicitly enables them in the sensitive-word library.
export const ABUSE_LEXICON_CANDIDATES:AbuseLexiconCandidate[]=[
  {question:'傻逼',keywords:['傻逼','煞笔','沙比','傻比','傻波一']},
  {question:'脑残',keywords:['脑残','脑子有病','脑子进水','没脑子']},
  {question:'智障',keywords:['智障','弱智','低能儿']},
  {question:'白痴',keywords:['白痴','蠢货','蠢蛋','蠢猪']},
  {question:'废物',keywords:['废物','窝囊废','没用的东西']},
  {question:'人渣',keywords:['人渣','败类','垃圾人']},
  {question:'贱人',keywords:['贱人','贱货','下贱东西']},
  {question:'畜生',keywords:['畜生','狗东西','狗杂种']},
  {question:'混蛋',keywords:['混蛋','王八蛋','臭混蛋']},
  {question:'不要脸',keywords:['不要脸','臭不要脸','厚颜无耻']},
  {question:'滚蛋',keywords:['滚蛋','滚远点','给我滚']},
  {question:'去死',keywords:['去死','怎么不去死','死一边去']},
  {question:'有病吧',keywords:['有病吧','神经病','死变态']},
  {question:'你妈的',keywords:['你妈的','他妈的','妈的','操你妈']},
];

export const ABUSE_LEXICON_SOURCE={
  coldataset:{name:'COLDataset',license:'Apache-2.0',url:'https://github.com/thu-coai/COLDataset'},
  sensitiveLexicon:{name:'Sensitive-lexicon',license:'MIT',url:'https://github.com/konsheng/Sensitive-lexicon'},
} as const;
