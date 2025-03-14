import type { ParseTree } from "../parser.js";

interface HelpTopic {
  title: string;
  content: string;
  children?: HelpTopic[];
}

const manual: HelpTopic = {
  title: "",
  content:
    "This is the root of the help system. Please use the below topics for specific information:",
  children: [
    {
      title: "Checks",
      content: `When taking any non-trivial action, you will need to make a *check* to determine success or failure.
			There are different types of checks for different sorts of situations, as described in the sections below.
			When determining the result of a check, you will often need to make a *roll* to determine your *score*.`,
      children: [
        {
          title: "Active checks",
          content: `An active check is made as a result of a deliberate action (e.g. attacking, climbing, repairing),
					or when reacting to a specific circumstance around you (e.g. vehicle maneuvering, g-forces).
					The result of an active check can be a *botch*, *failure*, *tie*, *success*, or *critical success*.`,
        },
        {
          title: "Passive check",
          content: `A passive check is made when events occur that you may not be aware of before they happen.
					For example, when a sound happens somewhere in the world, a passive *Listen* check is made to determine what information you get from the event.
					If you get no information from the event, you may not even know this type of check has been made at all!
					To prepare for a passive check, you can choose to make a *roll* on the relevant skill, which will persist your *score* for a period of time.`,
        },
      ],
    },
    {
      title: "Rolls",
      content: `When taking any non-trivial action, you will often need to make a *roll* to determine success or failure.
      There are different kinds of roll you can make, depending on your skill level, risk appetite, and whether you wish to spend or conserve your *energy*.
      The value of your roll is known as your *score*. If you rolled two dice, the score is the higher of the two.
      Roll scores are used by *active checks*, *passive checks*, and *limits*.`,
      children: [
        {
          title: "Rote",
          content: `Some tasks can be performed without thought or effort, simply by letting your training and muscle memory take over.
          By taking a *rote*, you automatically get a *score* equal to the number of marks in the skill, plus 1.
          You can take a rote for any skill, even if you have no marks allocated to it. In this case, though your score will be 1, it doesn't count as a *botch*.`,
        },
        {
          title: "Basic roll",
          content: `A normal execution of a task, putting in some thought but little effort.
          You roll a single dice, its value being the number of marks in the skill, plus 1, times 2. The minimum is a d4; the maximum is a d12 (at 5 marks).
          You need at least one mark in the skill to perform a Basic Roll. Remember that for low skill levels, there is a relatively high chance of a *botch*.`,
        },
        {
          title: "Push",
          content: `For important tasks, you can put in extra effort to make sure the job's done well.
          After spending a point of *energy* in the relevant *attribute*, you can roll two dice of the same value as those of a *basic roll*.
          Since you're rolling two dice, you have a chance of a *crit* success, and a relatively lower (but still extant) chance to *botch*.
          You need at least one mark in the skill to Push.`,
        },
        {
          title: "Risk",
          content: `Sometimes you're faced with a task that's simply beyond your normal abilities; but with a little creativity, you just might be able to pull it off.
          After spending a point of *energy* in the relevant *attribute*, you can make a *basic roll* as if you had one additional mark in the relevant skill.
          You can do this even if you have zero marks, giving you a d4 to roll.
          Since the maximum dice value is a d12, there is no need to risk if you have 5 or more marks in a skill.`,
        },
        {
          title: "Breeze",
          content: `When your're a master of your craft, you can complete simple tasks to perfection without even trying.
          You can make the equivalent roll of a *push* as if you had half the number of skill marks, rounded down, without spending any *energy*.
          Since you're rolling two dice, you have a chance of a *crit* success, and a relatively lower (but still extant) chance to *botch*.
          You need at least 2 marks in a skill to Breeze.`,
        },
        {
          title: "Summary",
          content: "",
        },
      ],
    },
    {
      title: "Skills",
      content: "",
    },
  ],
};

function helpSearchAll(topic: HelpTopic, words: string[]) {
  const topicWords = topic.title.split(" ").map(String.prototype.toLowerCase);
  const found = words.every((x) => topicWords.some((y) => y.includes(x)));
}

function helpSearch() {}

const help: ParseTree = [["help", (context) => {}]];
