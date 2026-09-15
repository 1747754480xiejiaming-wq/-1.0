export const BOT_INTRODUCTION="大家好！我是净千回源科技开发的材环教秘智能助手，是一款面向材料与环境相关专业师生打造的智能教学管理助手。我可以协助处理教学通知、课程安排、考试事务等日常工作，为教师和学生提供快速、准确、便捷的信息服务。\n\n通过智能问答、事项提醒、流程指引和文档辅助等功能，教秘AI助手有效提升教学管理效率，减少重复性事务，让信息传递更及时、师生沟通更顺畅，助力材环学院教学工作更加规范、高效、智能。\n很高兴为大家服务！让我们进行愉快的交流之旅吧!";

/** Fixed bot identity response, before knowledge lookup, image download or paid models. */
export function identityReply(question:string):string|null {
  const text=question.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
  // Match complete identity requests, not academic questions containing similar words.
  const prefix='(?:(?:你好|您好|请问|请|麻烦|能不能|能|可以|能否|给我|帮我|机器人|助手|小助手))*';
  const intent='(?:你(?:到底|究竟)?是谁|你(?:到底|究竟)?是什么(?:东西|玩意|机器人|助手|人|身份)?|你(?:是啥|是干嘛的|是做什么的)|你叫什么(?:名字|名称)?|你的(?:名字|名称|身份)是什么|你是(?:什么|哪个)(?:机器人|助手)|你是(?:谁|哪家公司|哪个公司)(?:开发|研发|制作|做)的|谁(?:开发|研发|制作)了你|(?:你)?(?:能不能|可以|能否|能)?(?:做个|做一下|来个|来一段)?自我介绍(?:一下)?|介绍(?:一下|下)?(?:你自己|自己|你)|说说你自己|whoareyou|introduceyourself)';
  return new RegExp('^'+prefix+intent+'(?:吗|呢|呀|啊|吧|呗|一下)*$','u').test(text)?BOT_INTRODUCTION:null;
}

export async function replyWithIdentity(question:string,fallback:()=>Promise<string>):Promise<string> {
  return identityReply(question)??await fallback();
}
