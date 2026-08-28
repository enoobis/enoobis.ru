const NICKNAME_RE = /^[A-Za-z]{3,24}$/;

export const NICKNAME_RULE_TEXT = "3-24 латинские буквы";

const RESERVED = split(`
  admin administrator admins moderator moder mod mods staff official
  support system security root owner help guest test tester tests
  api www http https null undefined anonymous anon everyone here all
  enoobis enoob enoo enobis bot robot server host mail email
  copilot openai google microsoft apple telegram instagram
`);

/* распространённые имена латиницей — ник должен быть ником, не именем */
const GIVEN_NAMES = split(`
  aadam aaliyah aaron abbas abdullah abigail abraham adam adela adele adem
  adilet adina adlan adrian adriana aibek aida aidos aigul aigerim
  aisha aizada ajan akbar akmal albert albina alejandro aleks aleksandr
  aleksei aleksey alena alessandro alessandra alex alexander alexandra
  alexei alexey alexia alexis alfred ali alia alice alicia alie alim
  alina alisa alisher alistair aliyah allen allison alma almaz alona
  alyona alyssa amalia amanda amelia amin amina amir amira amit ammar
  amy ana anastasia anastasiya anatoly andre andrea andreas andrei andrey
  andrew andrey andrii andy angel angela angelina anil anisa anja anka
  ann anna anne annette annie anora ansel anselm anson anta anton antonina
  anvar arian ariana ariel arina arman armen arnold aron arsenal art
  artem artemiy arthur artyom aruzhan aruzhan asel asel aslan asya atlas
  aubrey audrey austin ava axel aya ayana ayan aydan aydin ayub azamat
  azat aziz aziza aziza bailey bakhtiyor barbara barry bela bella ben
  benjamin bennett benson bernard bernice bert bessie beth betty
  beverly bilal bill billy bob bobby boris brad bradley brandon brenda
  brendan brian britney britany brooke brooklyn bruce bryan bryant
  byron caleb calvin cameron camila camilla candace cara carl carla
  carlos carmen carol carolina caroline carolyn carroll carter cary
  casey cassandra catherine cathy cecilia cedric celeste celia chad
  charles charlie charlotte chas chelsea cheryl chester chiara chloe
  chris christian christina christine christopher chuck cindy claire
  clara clark claudia clayton cliff clinton clive clyde cody cole
  colette colin colton conner connor conrad constance cooper cora
  corey cory craig crystal curtis cynthia cyril daisy dakota dale
  dallas damian damien damir dan dana dane daniel daniela daniil danil
  danila danny dante daphne darcy daria darian darius darlene darren
  darryl darwin daryl dave david davlat davron dawn dean deanna deb
  debbie deborah debra denis denise dennis derek desmond devon diana
  diane dilnoza dilshod dima dimitri dimitry dinara dmitri dmitriy
  dmitry dominic dominik donald donna dora dorian doris dorothy doug
  douglas drew duane duke dylan earl ed eddie edgar edith edmond
  edmund eduard edward edwin eileen ekaterina elaine eleanor elena
  eli elias elijah elina elisa elisabeth elise eliza elizabeth ella
  ellen ellie elliot elliott ellis elsa elton elvira ely elza emanuel
  emily emma emmanuel emmett enrique eric erica erik erika ernest
  ernesto erwin esther ethan eugene eugenia eva evan evans evelyn
  evgeni evgenia evgeniy evgeny evie ezra fabian faith farhod farid
  fatima faye federico felicia felix fernando fiona foma frances
  francesca francis francisco frank franklin fred freddie frederick
  gabriel gabriela gabrielle galina gary gavin gene genesis geoffrey
  george georgina georgy gerald geraldine gerard gina ginger giorgio
  giovanni gleb glen glenn gloria gordon grace graham grant greg
  gregory greta griffin gulnara gulnora gunther gus guy gwen hailey
  hale haley hamilton hamza hana hannah hans harold harper harrison
  harry hasan hassan hayden hayley hazel heather heidi helen helena
  helene henrietta henry herbert herman hilda holly howard hugh hugo
  hunter ian ibrahim ida igor ilya ilyas imran ina inna ira irene
  irina iris irving isaac isabel isabella isabelle isaiah ishak islam
  ismail ivan ivana ivanna ivo ivy jace jack jackie jackson jacob
  jacqueline jade jaden jaime jake jamal james jamie jan jane janet
  janice jared jarrod jasmine jason jasper javlon jay jayden jean
  jeanette jeanne jeff jefferson jeffrey jenna jennifer jenny jeremiah
  jeremy jerome jerry jesse jessica jessie jesus jill jim jimmy jo
  joan joanna joanne joaquin jocelyn jodi joe joel joey johann johanna
  john johnny johnson jon jonathan jordan jordyn jorge jose joseph
  josephine josh joshua josiah joyce joy juan juanita judith judy
  julia julian juliana julianna julie juliet julio julius june justin
  justine kamil kamila kara karen karim karina karl karolina katelyn
  katherine kathleen kathryn kathy katie katrina katya kay kayla
  kaylee keira keith kelly kelsey ken kendall kendra kennedy kenneth
  kenny kent kerry kevin khadija khalid kim kimberly kirill kirk kira
  kit kitty klaus knut kolya konstantin kostya kristen kristin
  kristina kristine kristy krystal ksenia kseniya kyle kylie kyra
  lacey lamar lance landon lara larry laura laurel lauren laurence
  laurie lawrence lea leah lee leila lena leo leon leonard leonardo
  leonid leroy les lesley leslie lester lev levi lewis lex lexie
  lia liam lila lilian lillian lily lina linda lindsay lisa liza
  logan lois lola london lora lord loren lorenzo lori lorraine louis
  louise lucas lucia lucille lucy luis luke lula luna luz lydia lyle
  lynda lynne mabel mack maddie madeline madison madina mae maggie
  mahdi maisie makar malachi malcolm malika mallory mamat mandi mandy
  manuel mara marc marcel marcelo marcia marco marcus margaret maria
  mariah marian marianne marie marilyn marina mario marion marisa
  marissa mark marko marlene marlon marsh marshall martha martin
  martina marty marvin mary maryam mashka mason matteo matthew matvei
  matvey maureen maurice max maxim maxima maxime maximilian maxine
  maya megan meghan mehmet melanie melissa melody melvin mercedes
  mercy meredith merlin mia michael micheal michel michele michelle
  mickey miguel mike mikhail milan milana milena miles miller millie
  milo milton misha mitchell mohamed mohammad mohammed molly mona
  monica monroe monroe morgan morris morton moses mustafa myles
  myron nadia nadezhda nadine nadya nana nancy naomi nargis nargiz
  nargiza nash nastya natalia natalie natalya natasha nate nathan
  nathalie nathaniel naum nazar nazira neil nelly nelson neo nia
  nicholas nick nicky nico nicolas nicole nigel nikita nikolai
  nikolay nina nixon noah noel nolan nora norman nurbek nuriddin
  nurislam nurlan nurzat oakley ocean octavia oleg olesya olga oliver
  olivia ollie omar omega ora oscar oskar ostap otto owen oxana
  pablo paige pam pamela paola paris park parker pat patricia patrick
  patsy patti patty paul paula paulette pauline pavel pearl pedro
  peggy penny perry pete peter petr petra phil philip phillip phoebe
  phoenix pierce pierre piper platon polina preston prince priscilla
  prokhor qasim quentin quincy quinn rachel rae rafael raheem rahim
  ralph ramon rana randall randi randy raoul raul raven ray raymond
  reagan rebecca rebekah reed regina reginald reid reina remi rene
  renee reuben rex reza rhea rhonda ricardo richard rick rickey
  ricky riley rita river rob robbie robert roberta robin robinson
  robyn rocco rockey rod rodion rodney roger roland rolando roman
  romeo ron ronald ronan ronda ronnie rory rosa rosalie rose rosemary
  rosie ross rowan roy ruben ruby rudolph rudy rufus rupert ruslan
  russell rustam rusty ruth ryan ryder rylan sabeena saber sabina
  sabine sabrina sacha sade sadie sage said sakura salim sally
  salvador sam samantha samir samira sammy samuel sander sandra sandy
  saniya santiago sapna sara sarah sashka sasha saul saveliy savva
  sawyer scarlet scarlett scott sean sebastian selena selma serena
  sergei sergey seth sevara shahzod shakhzod shane shania shannon
  shari sharon shaun shawn shay sheryl sherzod shirley shoxrux sid
  sidney sierra silvia simon simone sina slavik sofia sofya solomon
  sonia sonya sophia sophie spencer stacey stacy stan stanley stas
  stefan steffan stella sten stepan stephanie stephen steve steven
  stewart stone stuart sue susan susanna susanne susie suzanne syed
  sydney sylvia taha tamara tamerlan tammy tania tanya tara taras
  taryn tasha tate tatiana tatyana taylor ted teddy terence teresa
  terra terrance terrell terrence terry tessa thea theodore theresa
  thomas tia tiana tiara tiffany tilda tim timothy timur tina toby
  todd tom tomas tomasz tommaso tommy tony tory tracy travis trevor
  trey trinity troy trudy tyler tyson uliana ulvi umar umid umidjon
  uriel ursula utah vadim val valentin valentina valeria valerie
  valeriy valery vanessa vania vanya vera veronica vicki vickie
  vicky victor victoria viktoria vincent viola violet virgil virginia
  vitali vitaliy vitaly vito vitya vlad vlada vladimir vladislav
  vladlena volodymyr vova vyacheslav wade walker wallace walter
  wanda warren wayne wendy werner wesley weston whitney wilbur
  wiley wilfred will willa willard william willie willow wilson
  winnie winston wolf wolfgang woody wyatt xander xavier xenia
  yael yahya yana yaroslav yasmin yasmine yasya yegor yelena yesenia
  yosef yousef yulia yuliana yulianna yuri yury yusuf yvonne zach
  zachary zahra zain zainab zakir zara zayn zelda zhenya zoe zoey
  zoya
`);

const PROFANE_STRONG = split(`
  fuck fck fuk fuxk fucc fuckin fucking
  shit sh1t
  bitch btch
  cunt
  nigger nigga
  faggot fagot
  retard retarded
  whore slut
  penis pussy dildo
  porn porno xxxnudes
  pizda pizd pizdec pizdets
  huy hui xuy xyj huilo huinya huynya
  blyat blyad bljad blyatb
  eban ebat eblan eblanina
  mudak mudak mudila
  pidar pidor pedik pederast
  churka churki
  sukablyat
  scheisse scheise arschloch hurensohn wichser fotze
  putain connard salope encule ntm nique
  caonima cnmb nmsl shabi wocao
  kuso kutabare unsco unko
  hitler nazi swastika
`);

const PROFANE_EXACT = split(`
  ass dick cock tit tits boob boobs sex sexy
  suka sucka suca
  hernya
  arsch
  merde
  cao
  kuso
`);

function split(s) {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

function deleet(s) {
  return s
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function lettersOnly(s) {
  return s.replace(/[^a-z]/g, "");
}

function tokens(s) {
  return s.split(/[._]+/).filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function nicknameError(raw) {
  const n = String(raw ?? "").trim();
  if (!NICKNAME_RE.test(n)) return NICKNAME_RULE_TEXT;

  const low = n.toLowerCase();
  const core = lettersOnly(low);
  const core2 = deleet(core);
  const parts = tokens(low).map((t) => deleet(lettersOnly(t)));

  if (RESERVED.has(low) || RESERVED.has(core) || RESERVED.has(core2)) {
    return "этот ник занят системой";
  }

  const nameHits = [core, core2, ...parts].filter((p) => p.length >= 3 && GIVEN_NAMES.has(p));
  if (nameHits.length) return "это имя, выбери ник";

  const hay = `${low} ${core} ${core2} ${parts.join(" ")}`;
  for (const w of PROFANE_STRONG) {
    if (hay.includes(w)) return "так нельзя";
  }
  for (const p of [low, core, core2, ...parts]) {
    if (PROFANE_EXACT.has(p)) return "так нельзя";
  }
  return null;
}

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isValidNickname(n) {
  return nicknameError(n) === null;
}
