// @vitest-environment node
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

type Concept = {
  id: string
  ced_topic: string
  name_en: string
}

type Resource = {
  id: string
  type: string
  concepts: string[]
}

type QuizQuestion = {
  id: string
  concept_ids: string[]
}

type ContentLibrary = {
  concepts: Concept[]
  resources: Resource[]
}

const library = JSON.parse(
  readFileSync(join(__dirname, '../../data/content_library.json'), 'utf8'),
) as ContentLibrary

const quiz = JSON.parse(
  readFileSync(join(__dirname, '../../public/quiz-bank.json'), 'utf8'),
) as QuizQuestion[]

// College Board AP Chemistry Course and Exam Description, effective Fall 2024.
const OFFICIAL_CED_TOPICS = {
  '1.1': 'Moles and Molar Mass',
  '1.2': 'Mass Spectra of Elements',
  '1.3': 'Elemental Composition of Pure Substances',
  '1.4': 'Composition of Mixtures',
  '1.5': 'Atomic Structure and Electron Configuration',
  '1.6': 'Photoelectron Spectroscopy',
  '1.7': 'Periodic Trends',
  '1.8': 'Valence Electrons and Ionic Compounds',
  '2.1': 'Types of Chemical Bonds',
  '2.2': 'Intramolecular Force and Potential Energy',
  '2.3': 'Structure of Ionic Solids',
  '2.4': 'Structure of Metals and Alloys',
  '2.5': 'Lewis Diagrams',
  '2.6': 'Resonance and Formal Charge',
  '2.7': 'VSEPR and Bond Hybridization',
  '3.1': 'Intermolecular and Interparticle Forces',
  '3.2': 'Properties of Solids',
  '3.3': 'Solids, Liquids, and Gases',
  '3.4': 'Ideal Gas Law',
  '3.5': 'Kinetic Molecular Theory',
  '3.6': 'Deviation from Ideal Gas Law',
  '3.7': 'Solutions and Mixtures',
  '3.8': 'Representations of Solutions',
  '3.9': 'Separation of Solutions and Mixtures',
  '3.10': 'Solubility',
  '3.11': 'Spectroscopy and the Electromagnetic Spectrum',
  '3.12': 'Properties of Photons',
  '3.13': 'Beer-Lambert Law',
  '4.1': 'Introduction for Reactions',
  '4.2': 'Net Ionic Equations',
  '4.3': 'Representations of Reactions',
  '4.4': 'Physical and Chemical Changes',
  '4.5': 'Stoichiometry',
  '4.6': 'Introduction to Titration',
  '4.7': 'Types of Chemical Reactions',
  '4.8': 'Introduction to Acid-Base Reactions',
  '4.9': 'Oxidation-Reduction (Redox) Reactions',
  '5.1': 'Reaction Rates',
  '5.2': 'Introduction to Rate Law',
  '5.3': 'Concentration Changes Over Time',
  '5.4': 'Elementary Reactions',
  '5.5': 'Collision Model',
  '5.6': 'Reaction Energy Profile',
  '5.7': 'Introduction to Reaction Mechanisms',
  '5.8': 'Reaction Mechanism and Rate Law',
  '5.9': 'Pre-Equilibrium Approximation',
  '5.10': 'Multistep Reaction Energy Profile',
  '5.11': 'Catalysis',
  '6.1': 'Endothermic and Exothermic Processes',
  '6.2': 'Energy Diagrams',
  '6.3': 'Heat Transfer and Thermal Equilibrium',
  '6.4': 'Heat Capacity and Calorimetry',
  '6.5': 'Energy of Phase Changes',
  '6.6': 'Introduction to Enthalpy of Reaction',
  '6.7': 'Bond Enthalpies',
  '6.8': 'Enthalpy of Formation',
  '6.9': "Hess's Law",
  '7.1': 'Introduction to Equilibrium',
  '7.2': 'Direction of Reversible Reactions',
  '7.3': 'Reaction Quotient and Equilibrium Constant',
  '7.4': 'Calculating the Equilibrium Constant',
  '7.5': 'Magnitude of the Equilibrium Constant',
  '7.6': 'Properties of the Equilibrium Constant',
  '7.7': 'Calculating Equilibrium Concentrations',
  '7.8': 'Representations of Equilibrium',
  '7.9': "Introduction to Le Chatelier's Principle",
  '7.10': "Reaction Quotient and Le Chatelier's Principle",
  '7.11': 'Introduction to Solubility Equilibria',
  '7.12': 'Common-Ion Effect',
  '8.1': 'Introduction to Acids and Bases',
  '8.2': 'pH and pOH of Strong Acids and Bases',
  '8.3': 'Weak Acid and Base Equilibria',
  '8.4': 'Acid-Base Reactions and Buffers',
  '8.5': 'Acid-Base Titrations',
  '8.6': 'Molecular Structure of Acids and Bases',
  '8.7': 'pH and pKa',
  '8.8': 'Properties of Buffers',
  '8.9': 'Henderson-Hasselbalch Equation',
  '8.10': 'Buffer Capacity',
  '8.11': 'pH and Solubility',
  '9.1': 'Introduction to Entropy',
  '9.2': 'Absolute Entropy and Entropy Change',
  '9.3': 'Gibbs Free Energy and Thermodynamic Favorability',
  '9.4': 'Thermodynamic and Kinetic Control',
  '9.5': 'Free Energy and Equilibrium',
  '9.6': 'Free Energy of Dissolution',
  '9.7': 'Coupled Reactions',
  '9.8': 'Galvanic (Voltaic) and Electrolytic Cells',
  '9.9': 'Cell Potential and Free Energy',
  '9.10': 'Cell Potential Under Nonstandard Conditions',
  '9.11': "Electrolysis and Faraday's Law",
} as const

const OFFICIAL_TOPIC_CODES = new Set(Object.keys(OFFICIAL_CED_TOPICS))
const TEACHING_TYPES = new Set(['video', 'reading', 'article', 'interactive'])
const PRACTICE_TYPES = new Set(['exercise'])

function conceptIdsForTopic(topic: string): string[] {
  return library.concepts
    .filter(concept => concept.ced_topic === topic)
    .map(concept => concept.id)
}

describe('content library — Fall 2024 CED coverage', () => {
  it('uses only official Fall 2024 AP Chemistry CED topic codes', () => {
    const unsupported = library.concepts
      .filter(concept => !OFFICIAL_TOPIC_CODES.has(concept.ced_topic))
      .map(concept => `${concept.id}: ${concept.ced_topic}`)

    expect(unsupported, unsupported.join('\n')).toEqual([])
  })

  it('has at least one concept for every official CED topic', () => {
    const missing = Object.keys(OFFICIAL_CED_TOPICS)
      .filter(topic => conceptIdsForTopic(topic).length === 0)
      .map(topic => `${topic} ${OFFICIAL_CED_TOPICS[topic as keyof typeof OFFICIAL_CED_TOPICS]}`)

    expect(missing, missing.join('\n')).toEqual([])
  })

  it('all resource and quiz concept references resolve', () => {
    const conceptIds = new Set(library.concepts.map(concept => concept.id))

    const badResourceRefs = library.resources.flatMap(resource =>
      resource.concepts
        .filter(id => !conceptIds.has(id))
        .map(id => `${resource.id} -> ${id}`),
    )

    const badQuizRefs = quiz.flatMap(question =>
      question.concept_ids
        .filter(id => !conceptIds.has(id))
        .map(id => `${question.id} -> ${id}`),
    )

    expect(badResourceRefs, badResourceRefs.join('\n')).toEqual([])
    expect(badQuizRefs, badQuizRefs.join('\n')).toEqual([])
  })

  it('every official CED topic has teaching, practice, and quiz coverage', () => {
    const failures: string[] = []

    for (const [topic, name] of Object.entries(OFFICIAL_CED_TOPICS)) {
      const conceptIds = new Set(conceptIdsForTopic(topic))
      const resources = library.resources.filter(resource =>
        resource.concepts.some(id => conceptIds.has(id)),
      )
      const questions = quiz.filter(question =>
        question.concept_ids.some(id => conceptIds.has(id)),
      )

      const hasTeaching = resources.some(resource => TEACHING_TYPES.has(resource.type))
      const hasPractice = resources.some(resource => PRACTICE_TYPES.has(resource.type))
      const hasQuiz = questions.length > 0

      if (!hasTeaching || !hasPractice || !hasQuiz) {
        failures.push(
          [
            `${topic} ${name}`,
            `teaching=${hasTeaching}`,
            `practice=${hasPractice}`,
            `quiz=${hasQuiz}`,
            `concepts=${Array.from(conceptIds).join(', ')}`,
          ].join(' | '),
        )
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
