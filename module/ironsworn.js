/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { IronswornActor } from './actor.js'
import { IronswornItemSheet } from './item-sheet.js'
import { IronswornActorSheet } from './actor-sheet.js'

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once('init', async function () {
  console.log(`Initializing Ironsworn System`)

  // Define custom Entity classes
  CONFIG.Actor.entityClass = IronswornActor
  CONFIG.Dice.template = 'systems/foundry-ironsworn/templates/chat/roll.hbs'
  // CONFIG.RollTable.resultTemplate =
  //   'systems/foundry-ironsworn/templates/chat/table-draw.hbs'

  // Register sheet application classes
  Actors.unregisterSheet('core', ActorSheet)
  Actors.registerSheet('ironsworn', IronswornActorSheet, { makeDefault: true })
  Items.unregisterSheet('core', ItemSheet)
  Items.registerSheet('ironsworn', IronswornItemSheet, { makeDefault: true })

  // Register system settings
  game.settings.register('ironsworn', 'macroShorthand', {
    name: 'SETTINGS.SimpleMacroShorthandN',
    hint: 'SETTINGS.SimpleMacroShorthandL',
    scope: 'world',
    type: Boolean,
    default: true,
    config: true
  })
})

Hooks.once('setup', () => {
  Roll.prototype.render = async function (chatOptions = {}) {
    chatOptions = mergeObject(
      {
        user: game.user._id,
        flavor: null,
        template: CONFIG.Dice.template,
        blind: false
      },
      chatOptions
    )
    const isPrivate = chatOptions.isPrivate
    // Execute the roll, if needed
    if (!this._rolled) this.roll()
    // Define chat data
    const chatData = {
      formula: isPrivate ? '???' : this.formula,
      roll: this, // this is new
      flavor: isPrivate ? null : chatOptions.flavor,
      user: chatOptions.user,
      tooltip: isPrivate ? '' : await this.getTooltip(),
      total: isPrivate ? '?' : Math.round(this.total * 100) / 100
    }
    // Render the roll display template
    return renderTemplate(chatOptions.template, chatData)
  }
})

// Autofucus on input box when rolling
class IronswornRollDialog extends Dialog {}
Hooks.on('renderIronswornRollDialog', async (dialog, html, data) => {
  html.find('input').focus()
})

Handlebars.registerHelper('join', function (a, joiner) {
  return a.join(joiner)
})

Handlebars.registerHelper('json', function (context) {
  return JSON.stringify(context, null, 2)
})

Handlebars.registerHelper('ifIsIronswornRoll', function (options) {
  if (
    (this.roll.dice.length === 3 &&
      this.roll.dice.filter(x => x.faces === 6).length === 1 &&
      this.roll.dice.filter(x => x.faces === 10).length === 2) ||
    this.roll.formula.match(/{\d+,1d10,1d10}/)
  ) {
    return options.fn(this)
  } else {
    return options.inverse(this)
  }
})

function classesForRoll (r) {
  const d = r.dice[0]
  const maxRoll = d?.faces || 10
  return [
    d?.constructor.name.toLowerCase(),
    d && 'd' + d.faces,
    (d?.total || r.result) <= 1 ? 'min' : null,
    (d?.total || r.result) == maxRoll ? 'max' : null
  ]
    .filter(x => x)
    .join(' ')
}

const actionRoll = roll =>
  roll.terms[0].rolls.find(r => r.dice.length === 0 || r.dice[0].faces === 6)

const challengeRolls = roll =>
  roll.terms[0].rolls.filter(r => r.dice.length > 0 && r.dice[0].faces === 10)

Handlebars.registerHelper('actionDieFormula', function () {
  const r = actionRoll(this.roll)
  const terms = [...r.terms]
  const d = terms.shift()
  const classes = classesForRoll(r)
  return `<strong><span class="roll ${classes}">${d?.total || d}</span>${terms.join('')}</strong>`
})

Handlebars.registerHelper('challengeDice', function () {
  const [c1, c2] = challengeRolls(this.roll)
  const c1span = `<span class="roll ${classesForRoll(c1)}">${c1.total}</span>`
  const c2span = `<span class="roll ${classesForRoll(c2)}">${c2.total}</span>`
  return `${c1span} ${c2span}`
})

Handlebars.registerHelper('ironswornHitType', function () {
  const actionTotal = actionRoll(this.roll).total
  const [challenge1, challenge2] = challengeRolls(this.roll).map(x => x.total)
  const match = challenge1 === challenge2
  if (actionTotal <= Math.min(challenge1, challenge2)) {
    if (match) return 'Complication!'
    return 'Miss'
  }
  if (actionTotal > Math.max(challenge1, challenge2)) {
    if (match) return 'Opportunity!'
    return 'Strong Hit'
  }
  return 'Weak Hit'
})

export async function ironswornMoveRoll (bonusExpr = '0', values = {}, title) {
  const r = new Roll(`{d6+${bonusExpr}, d10,d10}`, values).roll()
  r.toMessage({ flavor: `<div class="move-title">${title}</div>` })
}

export async function ironswornRollDialog (data, stat, title) {
  const template = 'systems/foundry-ironsworn/templates/roll-dialog.hbs'
  const templateData = { data, stat }
  const html = await renderTemplate(template, templateData)
  let d = new IronswornRollDialog({
    title: title || `Roll +${stat}`,
    content: html,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d10"></i>',
        label: 'Roll',
        callback: x => {
          const form = x[0].querySelector('form')
          const bonus = parseInt(form[0].value, 10)
          ironswornMoveRoll(`@${stat}+${bonus || 0}`, data, title)
        }
      }
    },
    default: 'roll'
  })
  d.render(true)
}

Handlebars.registerHelper('rangeEach', function (context, options) {
  const results = []
  for (let value = context.hash.from; value >= context.hash.to; value--) {
    const valueStr = value > 0 ? `+${value}` : value.toString()
    const isCurrent = value === context.hash.current
    results.push(
      context.fn({
        ...this,
        valueStr,
        value,
        isCurrent
      })
    )
  }
  return results.join('\n')
})

Handlebars.registerHelper('capitalize', txt => {
  const [first, ...rest] = txt
  return `${first.toUpperCase()}${rest.join('')}`
})

Handlebars.registerHelper('progressCharacters', ctx => {
  const tickChar = [' ', '-', '+', '*'][ctx.data.current % 4]
  let characters = []
  for (let i = 0; i < Math.floor(ctx.data.current / 4); i++) {
    characters.push('#')
  }
  if (characters.length < 10) {
    characters.push(tickChar)
  }
  while (characters.length < 10) {
    characters.push('&nbsp;')
  }
  return characters
})

export const RANKS = {
  troublesome: 'Troublesome',
  dangerous: 'Dangerous',
  formidible: 'Formidible',
  extreme: 'Extreme',
  epic: 'Epic'
}

export const RANK_INCREMENTS = {
  troublesome: 12,
  dangerous: 8,
  formidible: 4,
  extreme: 2,
  epic: 1
}
