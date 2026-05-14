import { Effect, pipe } from "effect"

import type { BotRecord } from "../core/bot.js"
import { cliListManagedBots } from "./docker-discovery.js"
import { type PanelState, readPanelState, writePanelState } from "./state-store.js"

const botRuntimeFieldsEqual = (left: BotRecord, right: BotRecord): boolean =>
  left.containerId === right.containerId
  && left.containerName === right.containerName
  && left.hostGatewayPort === right.hostGatewayPort
  && left.status === right.status
  && left.volumeName === right.volumeName

const mergeKnownBot = (stored: BotRecord, discovered: BotRecord, now: string): BotRecord => {
  const candidate = {
    ...stored,
    containerId: discovered.containerId,
    containerName: discovered.containerName,
    hostGatewayPort: discovered.hostGatewayPort,
    status: discovered.status,
    volumeName: discovered.volumeName
  }
  return botRuntimeFieldsEqual(stored, candidate) ? stored : { ...candidate, updatedAt: now }
}

const mergeDiscoveredBots = (
  state: PanelState,
  discovered: ReadonlyArray<BotRecord>,
  now: string
): { readonly changed: boolean; readonly state: PanelState } => {
  const mergedStored = state.bots.map((bot) => {
    const discoveredBot = discovered.find((entry) => entry.id === bot.id)
    return discoveredBot === undefined ? bot : mergeKnownBot(bot, discoveredBot, now)
  })
  const missingDiscovered = discovered.filter((bot) => !state.bots.some((entry) => entry.id === bot.id))
  const mergedState = {
    bots: [
      ...mergedStored,
      ...missingDiscovered.map((bot) => ({
        ...bot,
        updatedAt: now
      }))
    ]
  }
  const changed = mergedState.bots.length !== state.bots.length
    || mergedState.bots.some((bot, index) => JSON.stringify(bot) !== JSON.stringify(state.bots[index]))
  return { changed, state: mergedState }
}

export const readSyncedPanelState = pipe(
  readPanelState,
  Effect.flatMap((state) =>
    pipe(
      cliListManagedBots,
      Effect.flatMap((discovered) => {
        const merged = mergeDiscoveredBots(state, discovered, new Date().toISOString())
        return merged.changed ? writePanelState(merged.state).pipe(Effect.as(merged.state)) : Effect.succeed(state)
      }),
      Effect.matchEffect({
        onFailure: () => Effect.succeed(state),
        onSuccess: (synced) => Effect.succeed(synced)
      })
    )
  )
)
