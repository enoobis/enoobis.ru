export type AgreementBlock = {
  title: string;
  body: string[];
};

export const AGREEMENT_TITLE_RU = "пользовательское соглашение";
export const AGREEMENT_TITLE_EN = "user agreement";

export const AGREEMENT_RU: AgreementBlock[] = [
  {
    title: "1. доступ и полномочия администрации",
    body: [
      "регистрация и использование платформы являются добровольными. доступ к платформе предоставляется исключительно по усмотрению администрации и не является гарантированным правом пользователя. администрация вправе в любое время, без предварительного уведомления, без объяснения причин и независимо от наличия нарушений ограничить, приостановить или полностью прекратить доступ пользователя к платформе, аккаунту, функциям, контенту или данным, а также изменять, отключать или удалять любые элементы и возможности сервиса. пользователь не вправе требовать сохранения или восстановления любых данных, контента, функций или иных элементов платформы.",
    ],
  },
  {
    title: "2. контент и поведение",
    body: [
      "запрещены незаконный, сексуальный, порнографический, насильственный, экстремистский, оскорбительный, дискриминационный, мошеннический, вредоносный, манипулятивный, вводящий в заблуждение, опасный и иной неприемлемый контент, включая материалы, полностью или частично созданные средствами искусственного интеллекта, а также угрозы, травля, преследование, спам, выдача себя за другое лицо, публикация чужих персональных данных, обход ограничений, вмешательство в работу платформы и иные злоупотребления. администрация самостоятельно определяет допустимость контента и поведения и вправе применять любые доступные платформе ограничения. пользователь самостоятельно отвечает за свои действия и размещаемый контент.",
    ],
  },
  {
    title: "3. данные, гарантии и условия использования",
    body: [
      "платформа вправе собирать, хранить, обрабатывать и анализировать пользовательские, технические и поведенческие данные в соответствии с установленными правилами обработки данных. платформа предоставляется «как есть». администрация не гарантирует бесперебойную работу, постоянную доступность, сохранность пользовательских данных, неизменность функциональности или соответствие платформы ожиданиям пользователя. администрация самостоятельно устанавливает и изменяет правила, ограничения, функциональность и порядок использования платформы. продолжая пользоваться платформой, пользователь принимает действующие условия.",
    ],
  },
];

export const AGREEMENT_EN: AgreementBlock[] = [
  {
    title: "1. access and administrative authority",
    body: [
      "registration and use of the platform are voluntary. access to the platform is granted solely at the administration’s discretion and is not a guaranteed right of the user.",
      "the administration may, at any time, without prior notice, without explanation, and regardless of whether any violation has occurred, restrict, suspend, or completely terminate a user’s access to the platform, account, features, content, or data, as well as modify, disable, or remove any elements or functionality of the service.",
      "the user may not demand the preservation or restoration of any data, content, features, or other elements of the platform.",
    ],
  },
  {
    title: "2. content and conduct",
    body: [
      "illegal, sexual, pornographic, violent, extremist, abusive, discriminatory, fraudulent, malicious, manipulative, misleading, dangerous, or otherwise unacceptable content is prohibited, including materials created wholly or partially using artificial intelligence, as well as threats, harassment, stalking, spam, impersonation, publication of another person’s personal data, circumvention of restrictions, interference with the operation of the platform, and other forms of abuse.",
      "the administration independently determines the acceptability of content and conduct and may impose any restrictions available on the platform. the user is solely responsible for their actions and submitted content.",
    ],
  },
  {
    title: "3. data, warranties, and terms of use",
    body: [
      "the platform may collect, store, process, and analyze user, technical, and behavioral data in accordance with its established data processing rules.",
      "the platform is provided “as is.” the administration does not guarantee uninterrupted operation, continuous availability, preservation of user data, unchanged functionality, or that the platform will meet the user’s expectations.",
      "the administration independently establishes and modifies the rules, restrictions, functionality, and terms of use of the platform. by continuing to use the platform, the user accepts the current terms.",
    ],
  },
];
