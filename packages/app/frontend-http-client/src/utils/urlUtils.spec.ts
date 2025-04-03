import {describe, expect, it } from "vitest"
import {joinURL} from "./urlUtils";

describe('urlUtils', () => {
    describe('joinURL', () => {
        it('preserves correct urls as-is', () => {
            expect(joinURL('http://localhost:8080', '/')).toMatchInlineSnapshot(`"http://localhost:8080/"`)
        })

        it('removes extra slashes between host and path', () => {
            expect(joinURL('http://localhost:8080/', '/')).toMatchInlineSnapshot(`"http://localhost:8080/"`)
        })

        it('preserve extra slashes within path itself', () => {
            expect(joinURL('http://localhost:8080', '/users//projects')).toMatchInlineSnapshot(`"http://localhost:8080/users//projects"`)
        })
    })
})
