export const errorMessage = (error: object): string => {
  if (error instanceof Error) {
    return error.message
  }
  if ("message" in error && typeof error.message === "string") {
    return error.message
  }
  return JSON.stringify(error)
}
