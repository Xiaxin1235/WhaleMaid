import { createElement as h, useState } from 'react'
import { DirectionSchema, goalDecisionCopy } from '@whaledot/core'
import type { Locale, Notification } from '@whaledot/core'
/** Only owner-facing cards render these controls. Snapshot the version at the first click. */
export function GoalDecisionButtons({
  notification,
  goal,
  locale,
  disabled,
  submit,
}: {
  notification: Notification
  goal: { title: string; version: number; status: string }
  locale: Locale
  disabled: boolean
  submit(input: {
    notificationId: string
    choice: 'abandon' | 'change-direction'
    goalVersion: number
    confirm?: true
    direction?: string
  }): Promise<void>
}) {
  const c = goalDecisionCopy(locale),
    [review, setReview] = useState<{
      choice: 'abandon' | 'change-direction'
      title: string
      version: number
    }>(),
    [direction, setDirection] = useState('')
  const inactive =
      disabled ||
      notification.resolvedAt !== undefined ||
      !!notification.routingSuggestionId ||
      (notification.expiresAt ?? 0) <= Date.now() ||
      !['active', 'paused'].includes(goal.status),
    valid = DirectionSchema.safeParse(direction)
  const commit = async () => {
    if (!review) return
    await submit({
      notificationId: notification.id,
      choice: review.choice,
      goalVersion: review.version,
      ...(review.choice === 'abandon' ? { confirm: true } : { direction }),
    })
    setReview(undefined)
  }
  return h(
    'div',
    { 'data-goal-decision': notification.id },
    ...(['abandon', 'change-direction'] as const)
      .filter((choice) => notification.choices?.includes(choice))
      .map((choice) =>
        h(
          'button',
          {
            key: choice,
            disabled: inactive,
            onClick: () => {
              setDirection('')
              setReview({ choice, title: goal.title, version: goal.version })
            },
          },
          choice === 'abandon' ? c.abandon : c.change,
        ),
      ),
    review &&
      h(
        'div',
        { role: 'dialog', 'aria-label': review.choice === 'abandon' ? c.abandon : c.change },
        h(
          'p',
          null,
          review.choice === 'abandon' ? c.abandonment(review.title) : `${review.title}：${c.directionHint}`,
        ),
        review.choice === 'change-direction' &&
          h(
            'label',
            null,
            c.direction,
            h('textarea', {
              'aria-label': c.direction,
              value: direction,
              onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setDirection(e.target.value),
            }),
          ),
        review.choice === 'change-direction' &&
          !valid.success &&
          h('p', { role: 'status' }, c.directionRequired),
        h(
          'button',
          {
            disabled: inactive || (review.choice === 'change-direction' && !valid.success),
            onClick: () => {
              void commit()
            },
          },
          review.choice === 'abandon' ? c.confirm : c.submitDirection,
        ),
        h('button', { disabled, onClick: () => setReview(undefined) }, c.cancel),
      ),
  )
}
