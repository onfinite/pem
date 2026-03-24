export enum PrepLogAction {
    // agent decisions
    CLASSIFY = 'classify', // deciding what preps to create from dump
    REASONING = 'reasoning', // agent deciding next step within a prep

    // tool calls
    SEARCH = 'search', // web search via Tavily/Exa
    LLM_CALL = 'llm_call', // any LLM call (Claude/GPT)

    // outcomes
    RETRY = 'retry', // retrying a failed tool call
    ERROR = 'error', // something failed
    DONE = 'done', // prep completed
}
